//! Shell integration installer for Blaze.
//!
//! Idempotent, versioned, reversible install of OSC 133 prompt-marking hooks
//! into shell rcfiles. Per `docs/specs.md` §5.3 and §7.4.
//!
//! Each rcfile gets a single managed block:
//!
//! ```text
//! # >>> blaze shell integration v1 — managed by Blaze, do not edit >>>
//! …snippet…
//! # <<< blaze shell integration v1 <<<
//! ```
//!
//! - **Install**: append the block if absent.
//! - **Reinstall** (snippet bumped): replace the contents of the existing block.
//! - **Uninstall**: remove the block (and a single surrounding blank line).
//!
//! We never touch anything outside our markers, so users can keep editing
//! their rcfiles without risk.

use std::fs;
use std::path::{Path, PathBuf};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

const BEGIN_MARKER: &str = "# >>> blaze shell integration v1 — managed by Blaze, do not edit >>>";
const END_MARKER: &str = "# <<< blaze shell integration v1 <<<";

const ZSH_SNIPPET: &str = include_str!("snippets/zsh.sh");
const BASH_SNIPPET: &str = include_str!("snippets/bash.sh");
const FISH_SNIPPET: &str = include_str!("snippets/fish.fish");

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "lowercase"))]
pub enum Shell {
    Zsh,
    Bash,
    Fish,
}

impl Shell {
    /// Returns every shell Blaze supports.
    pub fn all() -> &'static [Shell] {
        &[Shell::Zsh, Shell::Bash, Shell::Fish]
    }

    pub fn name(&self) -> &'static str {
        match self {
            Shell::Zsh => "zsh",
            Shell::Bash => "bash",
            Shell::Fish => "fish",
        }
    }

    fn snippet(&self) -> &'static str {
        match self {
            Shell::Zsh => ZSH_SNIPPET,
            Shell::Bash => BASH_SNIPPET,
            Shell::Fish => FISH_SNIPPET,
        }
    }

    /// Default rcfile location relative to `$HOME`.
    fn rcfile_relative(&self) -> &'static str {
        match self {
            Shell::Zsh => ".zshrc",
            Shell::Bash => ".bashrc",
            Shell::Fish => ".config/fish/config.fish",
        }
    }

    pub fn rcfile(&self) -> Option<PathBuf> {
        dirs_home().map(|h| h.join(self.rcfile_relative()))
    }
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("could not resolve home directory")]
    NoHome,
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
}

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "snake_case"))]
pub enum Status {
    /// Rcfile doesn't exist (e.g. user has never used this shell).
    NoRcfile,
    /// Rcfile exists and contains no Blaze block.
    NotInstalled,
    /// Blaze block present and matches the current snippet exactly.
    Current,
    /// Blaze block present but stale — reinstall would update it.
    Outdated,
}

#[derive(Debug, Clone)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct ShellStatus {
    pub shell: Shell,
    pub rcfile: PathBuf,
    pub status: Status,
}

pub fn status(shell: Shell) -> Result<ShellStatus> {
    let rcfile = shell.rcfile().ok_or(Error::NoHome)?;
    if !rcfile.exists() {
        return Ok(ShellStatus {
            shell,
            rcfile,
            status: Status::NoRcfile,
        });
    }
    let contents = fs::read_to_string(&rcfile)?;
    let st = match extract_block(&contents) {
        None => Status::NotInstalled,
        Some(existing) if existing.trim() == shell.snippet().trim() => Status::Current,
        Some(_) => Status::Outdated,
    };
    Ok(ShellStatus {
        shell,
        rcfile,
        status: st,
    })
}

pub fn status_all() -> Vec<ShellStatus> {
    Shell::all()
        .iter()
        .filter_map(|s| status(*s).ok())
        .collect()
}

pub fn install(shell: Shell) -> Result<ShellStatus> {
    let rcfile = shell.rcfile().ok_or(Error::NoHome)?;
    if let Some(parent) = rcfile.parent() {
        fs::create_dir_all(parent)?;
    }
    let existing = if rcfile.exists() {
        fs::read_to_string(&rcfile)?
    } else {
        String::new()
    };
    let updated = upsert_block(&existing, shell.snippet());
    write_atomic(&rcfile, &updated)?;
    status(shell)
}

pub fn uninstall(shell: Shell) -> Result<ShellStatus> {
    let rcfile = shell.rcfile().ok_or(Error::NoHome)?;
    if !rcfile.exists() {
        return status(shell);
    }
    let existing = fs::read_to_string(&rcfile)?;
    let updated = remove_block(&existing);
    if updated != existing {
        write_atomic(&rcfile, &updated)?;
    }
    status(shell)
}

/// Returns the snippet that would be installed for a given shell — useful
/// for "show me what will be added" UI in the consent dialog.
pub fn snippet(shell: Shell) -> &'static str {
    shell.snippet()
}

// ---------- internals ----------

fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

fn extract_block(contents: &str) -> Option<&str> {
    let begin = contents.find(BEGIN_MARKER)?;
    let after_begin = begin + BEGIN_MARKER.len();
    let end_rel = contents[after_begin..].find(END_MARKER)?;
    let end = after_begin + end_rel;
    Some(contents[after_begin..end].trim_matches('\n'))
}

fn upsert_block(contents: &str, snippet: &str) -> String {
    let new_block = format!(
        "{BEGIN_MARKER}\n{}\n{END_MARKER}",
        snippet.trim_end_matches('\n')
    );

    if let (Some(begin), Some(end)) = (contents.find(BEGIN_MARKER), contents.find(END_MARKER)) {
        let end_full = end + END_MARKER.len();
        let mut out = String::with_capacity(contents.len() + new_block.len());
        out.push_str(&contents[..begin]);
        out.push_str(&new_block);
        out.push_str(&contents[end_full..]);
        return out;
    }
    let mut out = contents.to_string();
    if !out.is_empty() && !out.ends_with('\n') {
        out.push('\n');
    }
    if !out.is_empty() {
        out.push('\n');
    }
    out.push_str(&new_block);
    out.push('\n');
    out
}

fn remove_block(contents: &str) -> String {
    let Some(begin) = contents.find(BEGIN_MARKER) else {
        return contents.to_string();
    };
    let Some(end_rel) = contents[begin..].find(END_MARKER) else {
        return contents.to_string();
    };
    let end = begin + end_rel + END_MARKER.len();

    let before = &contents[..begin];
    let after = &contents[end..];

    // Trim a single blank line on each side that we created at install time.
    let before = before.trim_end_matches('\n');
    let after = after.trim_start_matches('\n');

    let mut out = String::with_capacity(before.len() + after.len() + 1);
    out.push_str(before);
    if !before.is_empty() && !after.is_empty() {
        out.push('\n');
    }
    out.push_str(after);
    if !out.ends_with('\n') && !out.is_empty() {
        out.push('\n');
    }
    out
}

fn write_atomic(path: &Path, contents: &str) -> Result<()> {
    let tmp = path.with_extension("blaze.tmp");
    fs::write(&tmp, contents)?;
    fs::rename(&tmp, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn install_into_empty_file() {
        let out = upsert_block("", "echo hi");
        assert!(out.contains(BEGIN_MARKER));
        assert!(out.contains("echo hi"));
        assert!(out.contains(END_MARKER));
    }

    #[test]
    fn install_appends_to_existing() {
        let out = upsert_block("export FOO=bar\n", "echo hi");
        assert!(out.starts_with("export FOO=bar\n"));
        assert!(out.contains(BEGIN_MARKER));
    }

    #[test]
    fn reinstall_replaces_block() {
        let initial = upsert_block("export FOO=bar\n", "echo old");
        let updated = upsert_block(&initial, "echo new");
        assert!(updated.contains("echo new"));
        assert!(!updated.contains("echo old"));
        // Should still contain only one block.
        assert_eq!(updated.matches(BEGIN_MARKER).count(), 1);
    }

    #[test]
    fn uninstall_removes_block_cleanly() {
        let initial = upsert_block("export FOO=bar\n", "echo hi");
        let removed = remove_block(&initial);
        assert!(!removed.contains(BEGIN_MARKER));
        assert!(!removed.contains("echo hi"));
        assert!(removed.contains("export FOO=bar"));
    }

    #[test]
    fn uninstall_noop_when_absent() {
        let original = "export FOO=bar\n";
        assert_eq!(remove_block(original), original);
    }
}
