//! Parser for `grep -n` and `rg` output: `path:line:matched-text`.
//!
//! Tolerant of:
//! - leading `./` paths (POSIX `grep -rn ./...`)
//! - bytes-offset variants (`grep -bn`) — we keep the leading number as line
//! - `--` group separators emitted between match groups (silently skipped)

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::ansi;

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct GrepMatch {
    pub path: String,
    pub line: u32,
    pub text: String,
}

pub fn parse(output: &[u8]) -> Option<Vec<GrepMatch>> {
    let cleaned = ansi::strip(output);
    let text = std::str::from_utf8(&cleaned).ok()?;

    let mut matches = Vec::new();
    for raw in text.lines() {
        let line = raw.trim_end();
        if line.is_empty() || line == "--" {
            continue;
        }
        if let Some(m) = parse_line(line) {
            matches.push(m);
        }
    }
    if matches.is_empty() {
        None
    } else {
        Some(matches)
    }
}

fn parse_line(line: &str) -> Option<GrepMatch> {
    // Walk the line looking for the second `:`. The first `:` separates path
    // from line number; the second separates line number from text. Paths can
    // legitimately contain `:` so we anchor on the line number being all
    // digits between the two separators.
    let mut sep1 = None;
    let mut sep2 = None;
    let bytes = line.as_bytes();
    for (i, &b) in bytes.iter().enumerate() {
        if b != b':' {
            continue;
        }
        if sep1.is_none() {
            sep1 = Some(i);
            continue;
        }
        // sep1 is set — check if [sep1+1..i] is all digits.
        if let Some(s1) = sep1 {
            let between = &line[s1 + 1..i];
            if !between.is_empty() && between.bytes().all(|b| b.is_ascii_digit()) {
                sep2 = Some(i);
                break;
            }
            // Not a line-number — keep looking; treat earlier `:` as part of path.
            sep1 = Some(i);
        }
    }
    let s1 = sep1?;
    let s2 = sep2?;
    let path = line[..s1].to_string();
    let line_no = line[s1 + 1..s2].parse::<u32>().ok()?;
    let text = line[s2 + 1..].to_string();
    if path.is_empty() {
        return None;
    }
    Some(GrepMatch {
        path,
        line: line_no,
        text,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_grep_n_output() {
        let out = b"src/main.rs:12:fn main() {\nsrc/lib.rs:7:    let x = 1;\n";
        let matches = parse(out).unwrap();
        assert_eq!(matches.len(), 2);
        assert_eq!(matches[0].path, "src/main.rs");
        assert_eq!(matches[0].line, 12);
        assert_eq!(matches[0].text, "fn main() {");
    }

    #[test]
    fn parses_rg_output_with_leading_dot() {
        let out = b"./README.md:5:Blaze is a smart terminal\n";
        let matches = parse(out).unwrap();
        assert_eq!(matches[0].path, "./README.md");
        assert_eq!(matches[0].line, 5);
    }

    #[test]
    fn handles_paths_with_colons() {
        // Windows-style or weird path; line number still detected as the only
        // all-digit segment between two colons.
        let out = b"foo:bar.txt:42:contents here\n";
        let matches = parse(out).unwrap();
        assert_eq!(matches[0].path, "foo:bar.txt");
        assert_eq!(matches[0].line, 42);
    }

    #[test]
    fn skips_separator_lines() {
        let out = b"a.rs:1:foo\n--\nb.rs:2:bar\n";
        let matches = parse(out).unwrap();
        assert_eq!(matches.len(), 2);
    }

    #[test]
    fn returns_none_for_garbage() {
        assert!(parse(b"not grep output").is_none());
        assert!(parse(b"").is_none());
    }
}
