//! `find` parser. Each non-empty line is one path entry.

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::ansi;

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct FindEntry {
    pub path: String,
    /// `find` doesn't tell us the entry kind without `-printf` formatting.
    /// We guess from a trailing `/` and let the caller treat unknowns as files.
    pub looks_like_dir: bool,
}

pub fn parse(output: &[u8]) -> Option<Vec<FindEntry>> {
    let cleaned = ansi::strip(output);
    let text = std::str::from_utf8(&cleaned).ok()?;

    let entries: Vec<FindEntry> = text
        .lines()
        .map(str::trim_end)
        .filter(|l| !l.is_empty() && !l.starts_with("find:"))
        .map(|l| FindEntry {
            looks_like_dir: l.ends_with('/'),
            path: l.trim_end_matches('/').to_string(),
        })
        .collect();

    if entries.is_empty() {
        None
    } else {
        Some(entries)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_basic_find_output() {
        let out = b"./src/main.rs\n./src/lib.rs\n./Cargo.toml\n";
        let entries = parse(out).unwrap();
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].path, "./src/main.rs");
        assert!(!entries[0].looks_like_dir);
    }

    #[test]
    fn detects_trailing_slash_as_dir() {
        let out = b"./src/\n./Cargo.toml\n";
        let entries = parse(out).unwrap();
        assert!(entries[0].looks_like_dir);
        assert_eq!(entries[0].path, "./src");
        assert!(!entries[1].looks_like_dir);
    }

    #[test]
    fn skips_find_error_lines() {
        let out = b"./ok\nfind: ./forbidden: Permission denied\n./ok2\n";
        let entries = parse(out).unwrap();
        assert_eq!(entries.len(), 2);
    }

    #[test]
    fn empty_input_yields_none() {
        assert!(parse(b"").is_none());
        assert!(parse(b"\n\n").is_none());
    }
}
