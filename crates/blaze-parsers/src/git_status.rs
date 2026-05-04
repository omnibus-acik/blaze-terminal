//! Parser for default `git status` output (the verbose, human-readable form).
//!
//! Recognises three sections:
//! - `Changes to be committed:` → staged
//! - `Changes not staged for commit:` → unstaged modifications
//! - `Untracked files:` → untracked
//!
//! Lines inside each section that start with whitespace and contain a path
//! are emitted as entries. We tolerate `git status -sb` shorthand by also
//! parsing the leading two-character status code form.

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::ansi;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "snake_case"))]
pub enum GitFileState {
    Staged,
    Modified,
    Deleted,
    Renamed,
    Untracked,
    Conflicted,
}

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct GitStatusEntry {
    pub state: GitFileState,
    pub path: String,
    pub original_path: Option<String>,
}

pub fn parse(output: &[u8]) -> Option<Vec<GitStatusEntry>> {
    let cleaned = ansi::strip(output);
    let text = std::str::from_utf8(&cleaned).ok()?;

    let mut entries = Vec::new();
    let mut section: Option<Section> = None;

    for raw in text.lines() {
        let line = raw.trim_end();
        if line.is_empty() {
            continue;
        }
        // Section headers — set the current category and skip.
        if let Some(s) = detect_section(line) {
            section = Some(s);
            continue;
        }
        // `git status -sb` shorthand: `XY path` where X/Y are status chars.
        if let Some(entry) = parse_porcelain_line(line) {
            entries.push(entry);
            continue;
        }
        // Verbose section body lines: `\t<verb>:\s+<path>` or `\t<path>` for
        // untracked. Section bodies are always indented; non-indented lines
        // are git's narrative trailers (e.g. "no changes added to commit…").
        let is_indented = line
            .as_bytes()
            .first()
            .is_some_and(|&b| b == b' ' || b == b'\t');
        if !is_indented {
            continue;
        }
        if let Some(s) = section {
            if let Some(entry) = parse_verbose_body(line, s) {
                entries.push(entry);
            }
        }
    }

    if entries.is_empty() {
        None
    } else {
        Some(entries)
    }
}

#[derive(Copy, Clone)]
enum Section {
    Staged,
    Unstaged,
    Untracked,
    Conflicted,
}

fn detect_section(line: &str) -> Option<Section> {
    let l = line.trim();
    if l.starts_with("Changes to be committed:") {
        Some(Section::Staged)
    } else if l.starts_with("Changes not staged for commit:") {
        Some(Section::Unstaged)
    } else if l.starts_with("Untracked files:") {
        Some(Section::Untracked)
    } else if l.starts_with("Unmerged paths:") {
        Some(Section::Conflicted)
    } else {
        None
    }
}

fn parse_verbose_body(line: &str, section: Section) -> Option<GitStatusEntry> {
    // Skip the parenthetical hint lines git emits inside each section.
    let trimmed = line.trim_start();
    if trimmed.starts_with('(') {
        return None;
    }
    if trimmed.is_empty() {
        return None;
    }

    // Verbose form for staged/unstaged: `<verb>:   <path>` (or
    // `renamed:   old -> new`).
    if let Some(rest) = trimmed.strip_prefix("modified:").map(str::trim_start) {
        return Some(GitStatusEntry {
            state: GitFileState::Modified,
            path: rest.to_string(),
            original_path: None,
        });
    }
    if let Some(rest) = trimmed.strip_prefix("new file:").map(str::trim_start) {
        return Some(GitStatusEntry {
            state: GitFileState::Staged,
            path: rest.to_string(),
            original_path: None,
        });
    }
    if let Some(rest) = trimmed.strip_prefix("deleted:").map(str::trim_start) {
        return Some(GitStatusEntry {
            state: GitFileState::Deleted,
            path: rest.to_string(),
            original_path: None,
        });
    }
    if let Some(rest) = trimmed.strip_prefix("renamed:").map(str::trim_start) {
        let (orig, new) = match rest.split_once(" -> ") {
            Some(p) => p,
            None => (rest, rest),
        };
        return Some(GitStatusEntry {
            state: GitFileState::Renamed,
            path: new.to_string(),
            original_path: Some(orig.to_string()),
        });
    }

    // Untracked section: bare paths.
    if matches!(section, Section::Untracked) {
        return Some(GitStatusEntry {
            state: GitFileState::Untracked,
            path: trimmed.to_string(),
            original_path: None,
        });
    }

    if matches!(section, Section::Staged) {
        // Some staged entries appear without a verb prefix in newer git.
        return Some(GitStatusEntry {
            state: GitFileState::Staged,
            path: trimmed.to_string(),
            original_path: None,
        });
    }

    None
}

fn parse_porcelain_line(line: &str) -> Option<GitStatusEntry> {
    // git status -sb shorthand: two status chars, a space, then path.
    // We don't try to be exhaustive; just enough to recognise the common cases.
    if line.len() < 4 {
        return None;
    }
    let bytes = line.as_bytes();
    let x = bytes[0];
    let y = bytes[1];
    if bytes[2] != b' ' {
        return None;
    }
    let staged = is_porcelain_status_char(x);
    let unstaged = is_porcelain_status_char(y);
    if !staged && !unstaged {
        return None;
    }
    let path = line[3..].to_string();
    let state = match (x, y) {
        (b'?', b'?') => GitFileState::Untracked,
        (b'U', _) | (_, b'U') => GitFileState::Conflicted,
        (b'R', _) => GitFileState::Renamed,
        (b'D', _) | (_, b'D') => GitFileState::Deleted,
        (s, _) if s != b' ' => GitFileState::Staged,
        _ => GitFileState::Modified,
    };
    Some(GitStatusEntry {
        state,
        path,
        original_path: None,
    })
}

fn is_porcelain_status_char(b: u8) -> bool {
    matches!(
        b,
        b' ' | b'M' | b'A' | b'D' | b'R' | b'C' | b'U' | b'?' | b'!' | b'T'
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    const VERBOSE: &str = "On branch main
Your branch is up to date with 'origin/main'.

Changes to be committed:
  (use \"git restore --staged <file>...\" to unstage)
\tmodified:   docs/specs.md
\tnew file:   docs/added.md

Changes not staged for commit:
  (use \"git add <file>...\" to update what will be committed)
\tmodified:   src/main.rs
\tdeleted:    old.txt

Untracked files:
  (use \"git add <file>...\" to include in what will be committed)
\tnew-file.txt
\tnew-dir/

no changes added to commit (use \"git add\" and/or \"git commit -a\" to track)
";

    #[test]
    fn parses_verbose_status() {
        let entries = parse(VERBOSE.as_bytes()).unwrap();
        // staged: 1 modified + 1 new file = 2; unstaged: 1 modified + 1 deleted = 2;
        // untracked: 2. Total 6.
        assert_eq!(entries.len(), 6);

        assert_eq!(entries[0].state, GitFileState::Modified);
        assert_eq!(entries[0].path, "docs/specs.md");
        assert_eq!(entries[1].state, GitFileState::Staged);
        assert_eq!(entries[1].path, "docs/added.md");
        assert_eq!(entries[2].state, GitFileState::Modified);
        assert_eq!(entries[2].path, "src/main.rs");
        assert_eq!(entries[3].state, GitFileState::Deleted);
        assert_eq!(entries[3].path, "old.txt");
        assert_eq!(entries[4].state, GitFileState::Untracked);
        assert_eq!(entries[4].path, "new-file.txt");
        assert_eq!(entries[5].path, "new-dir/");
    }

    #[test]
    fn parses_renamed_with_arrow() {
        let out = b"Changes to be committed:\n\trenamed:    old/path.rs -> new/path.rs\n";
        let entries = parse(out).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].state, GitFileState::Renamed);
        assert_eq!(entries[0].path, "new/path.rs");
        assert_eq!(entries[0].original_path.as_deref(), Some("old/path.rs"));
    }

    #[test]
    fn parses_porcelain_short() {
        let out = b" M src/main.rs\n?? newfile.txt\nA  staged.rs\n";
        let entries = parse(out).unwrap();
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].state, GitFileState::Modified);
        assert_eq!(entries[1].state, GitFileState::Untracked);
        assert_eq!(entries[2].state, GitFileState::Staged);
    }

    #[test]
    fn empty_when_clean() {
        let out = b"On branch main\nnothing to commit, working tree clean\n";
        assert!(parse(out).is_none());
    }
}
