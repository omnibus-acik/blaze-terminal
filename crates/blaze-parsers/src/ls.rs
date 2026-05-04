//! `ls -l` / `ls -la` parser.
//!
//! Recognises the long-form output produced by both BSD `ls` (macOS) and GNU
//! `ls`. The first `total <n>` line is skipped; each subsequent line is
//! parsed as one entry with permissions, size, and name.

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::ansi;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "lowercase"))]
pub enum LsEntryKind {
    File,
    Dir,
    Symlink,
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct LsEntry {
    pub kind: LsEntryKind,
    pub name: String,
    pub size: Option<u64>,
    pub mode: Option<String>,
    pub target: Option<String>,
}

/// Parse a captured `ls -l` block. Returns `None` if no recognisable entries
/// were found (caller treats that as "no parsed view available").
pub fn parse(output: &[u8], _truncated: bool) -> Option<Vec<LsEntry>> {
    let cleaned = ansi::strip(output);
    let text = std::str::from_utf8(&cleaned).ok()?;
    let mut entries = Vec::new();
    for line in text.lines() {
        if let Some(entry) = parse_line(line) {
            entries.push(entry);
        }
    }
    if entries.is_empty() {
        None
    } else {
        Some(entries)
    }
}

fn parse_line(line: &str) -> Option<LsEntry> {
    let line = line.trim_end_matches(['\r', '\n']);
    if line.is_empty() || line.starts_with("total ") {
        return None;
    }

    let (header, name_field) = split_off_name(line, 8)?;

    let mut tokens = header.split_whitespace();
    let perms = tokens.next()?;
    let _links = tokens.next()?;
    let _owner = tokens.next()?;
    let _group = tokens.next()?;
    let size = tokens.next().and_then(|s| s.parse::<u64>().ok());

    let kind = match perms.chars().next()? {
        'd' => LsEntryKind::Dir,
        '-' => LsEntryKind::File,
        'l' => LsEntryKind::Symlink,
        _ => LsEntryKind::Other,
    };

    let (name, target) = match name_field.find(" -> ") {
        Some(idx) => (
            name_field[..idx].to_string(),
            Some(name_field[idx + 4..].to_string()),
        ),
        None => (name_field.to_string(), None),
    };

    if name.is_empty() {
        return None;
    }

    Some(LsEntry {
        kind,
        name,
        size,
        mode: Some(perms.to_string()),
        target,
    })
}

/// Walk the line and split it into (header, name) at the start of the
/// `tokens_before_name + 1`-th whitespace-separated token. Returns `None`
/// if the line doesn't have that many tokens.
fn split_off_name(line: &str, tokens_before_name: usize) -> Option<(&str, &str)> {
    let bytes = line.as_bytes();
    let mut tokens_seen = 0;
    let mut in_token = false;
    for (i, &b) in bytes.iter().enumerate() {
        let is_ws = b == b' ' || b == b'\t';
        if is_ws {
            in_token = false;
        } else if !in_token {
            in_token = true;
            tokens_seen += 1;
            if tokens_seen == tokens_before_name + 1 {
                let header = &line[..i].trim_end();
                let name = &line[i..];
                return Some((header, name));
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    const BSD_OUTPUT: &str = "total 24
drwxr-xr-x  3 user  staff    96 May  3 15:23 dir1
-rw-r--r--  1 user  staff  1234 May  3 15:23 file.txt
lrwxr-xr-x  1 user  staff     5 May  3 15:23 link -> target
";

    const GNU_OUTPUT: &str = "total 24
drwxr-xr-x 3 user group   96 May  3 15:23 dir1
-rw-r--r-- 1 user group 1234 May  3 15:23 file.txt
";

    #[test]
    fn parses_bsd_ls_long() {
        let entries = parse(BSD_OUTPUT.as_bytes(), false).unwrap();
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].kind, LsEntryKind::Dir);
        assert_eq!(entries[0].name, "dir1");
        assert_eq!(entries[1].kind, LsEntryKind::File);
        assert_eq!(entries[1].size, Some(1234));
        assert_eq!(entries[2].kind, LsEntryKind::Symlink);
        assert_eq!(entries[2].name, "link");
        assert_eq!(entries[2].target.as_deref(), Some("target"));
    }

    #[test]
    fn parses_gnu_ls_long() {
        let entries = parse(GNU_OUTPUT.as_bytes(), false).unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].name, "dir1");
        assert_eq!(entries[1].name, "file.txt");
    }

    #[test]
    fn handles_filenames_with_spaces() {
        let line = "-rw-r--r--  1 user  staff  10 May  3 15:23 my file.txt";
        let entry = parse_line(line).unwrap();
        assert_eq!(entry.name, "my file.txt");
    }

    #[test]
    fn strips_ansi_color_codes() {
        let colored = b"total 0\n\x1b[1;34mdrwxr-xr-x\x1b[0m  3 user  staff   96 May  3 15:23 \x1b[1;36mdir1\x1b[0m\n";
        let entries = parse(colored, false).unwrap();
        assert_eq!(entries[0].name, "dir1");
        assert_eq!(entries[0].kind, LsEntryKind::Dir);
    }

    #[test]
    fn ignores_garbage_input() {
        assert!(parse(b"not ls output", false).is_none());
        assert!(parse(b"", false).is_none());
    }
}
