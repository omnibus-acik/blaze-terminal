//! Output parsers for known commands.
//!
//! Recognises a small set of well-known CLI tools and turns their stdout into
//! a structured [`ParsedBlock`] that the UI can render as clickable rows.

pub mod ansi;
pub mod find;
pub mod git_status;
pub mod grep;
pub mod ls;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

/// Result of parsing a single completed command block.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde", serde(tag = "kind", rename_all = "snake_case"))]
pub enum ParsedBlock {
    Ls {
        entries: Vec<ls::LsEntry>,
        truncated: bool,
    },
    Find {
        entries: Vec<find::FindEntry>,
        truncated: bool,
    },
    Grep {
        matches: Vec<grep::GrepMatch>,
        truncated: bool,
    },
    GitStatus {
        entries: Vec<git_status::GitStatusEntry>,
        truncated: bool,
    },
}

/// Pick the right parser (if any) for a command and run it on the captured
/// output bytes. Returns `None` if no parser matches or parsing produces no
/// useful entries.
pub fn parse(command: &str, output: &[u8], truncated: bool) -> Option<ParsedBlock> {
    let argv0 = first_token(command)?;

    if matches_ls(argv0, command) {
        return ls::parse(output, truncated).map(|entries| ParsedBlock::Ls { entries, truncated });
    }
    if matches_find(argv0) {
        return find::parse(output).map(|entries| ParsedBlock::Find { entries, truncated });
    }
    if matches_grep(argv0, command) {
        return grep::parse(output).map(|matches| ParsedBlock::Grep { matches, truncated });
    }
    if matches_git_status(argv0, command) {
        return git_status::parse(output)
            .map(|entries| ParsedBlock::GitStatus { entries, truncated });
    }
    None
}

fn matches_ls(argv0: &str, command: &str) -> bool {
    if argv0 != "ls" && argv0 != "/bin/ls" && !argv0.ends_with("/ls") {
        return false;
    }
    has_flag(command, 'l')
}

fn matches_find(argv0: &str) -> bool {
    argv0 == "find" || argv0 == "/usr/bin/find" || argv0.ends_with("/find")
}

fn matches_grep(argv0: &str, command: &str) -> bool {
    let is_grep = argv0 == "grep" || argv0 == "/usr/bin/grep" || argv0.ends_with("/grep");
    let is_rg = argv0 == "rg" || argv0.ends_with("/rg");
    if is_rg {
        return true; // rg defaults to file:line:text format
    }
    if !is_grep {
        return false;
    }
    has_flag(command, 'n') || has_flag(command, 'H')
}

fn matches_git_status(argv0: &str, command: &str) -> bool {
    let is_git = argv0 == "git" || argv0.ends_with("/git");
    if !is_git {
        return false;
    }
    // Locate the subcommand — the first non-flag token after `git`.
    let mut tokens = command.split_whitespace().skip(1);
    while let Some(t) = tokens.next() {
        if t.starts_with('-') {
            // Skip global option and possibly its value.
            if matches!(t, "-c" | "-C" | "--git-dir" | "--work-tree") {
                let _ = tokens.next();
            }
            continue;
        }
        return t == "status";
    }
    false
}

/// Extract the first whitespace-separated token, ignoring leading
/// `env`/`sudo`/`time` prefixes and bash variable assignments.
fn first_token(cmd: &str) -> Option<&str> {
    for token in cmd.split_whitespace() {
        if token.contains('=') {
            continue;
        }
        if matches!(token, "sudo" | "env" | "time" | "command" | "exec" | "nice") {
            continue;
        }
        return Some(token);
    }
    None
}

/// True if the command line contains a short flag with this letter.
fn has_flag(cmd: &str, letter: char) -> bool {
    for token in cmd.split_whitespace() {
        if let Some(rest) = token.strip_prefix("--") {
            if rest.starts_with(letter) {
                return true;
            }
            continue;
        }
        if let Some(short) = token.strip_prefix('-') {
            if short.starts_with('-') {
                continue;
            }
            if short.contains(letter) {
                return true;
            }
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_token_skips_var_and_sudo() {
        assert_eq!(first_token("sudo ls -la"), Some("ls"));
        assert_eq!(first_token("FOO=bar ls"), Some("ls"));
        assert_eq!(first_token("env LANG=C ls -l"), Some("ls"));
    }

    #[test]
    fn detects_long_flag() {
        assert!(has_flag("ls -l", 'l'));
        assert!(has_flag("ls -la", 'l'));
        assert!(has_flag("ls -al", 'l'));
        assert!(has_flag("ls --long", 'l'));
        assert!(!has_flag("ls -a", 'l'));
        assert!(!has_flag("ls", 'l'));
    }

    #[test]
    fn ls_dispatch() {
        assert!(matches_ls("ls", "ls -l"));
        assert!(matches_ls("/bin/ls", "/bin/ls -la"));
        assert!(matches_ls("/usr/local/bin/ls", "/usr/local/bin/ls -la"));
        assert!(!matches_ls("ls", "ls"));
        assert!(!matches_ls("less", "less file.txt"));
    }

    #[test]
    fn find_dispatch() {
        assert!(matches_find("find"));
        assert!(matches_find("/usr/bin/find"));
        assert!(!matches_find("findutils"));
    }

    #[test]
    fn grep_dispatch() {
        assert!(matches_grep("grep", "grep -n foo file"));
        assert!(matches_grep("grep", "grep -rn foo ."));
        assert!(!matches_grep("grep", "grep foo file"));
        assert!(matches_grep("rg", "rg foo"));
    }

    #[test]
    fn git_status_dispatch() {
        assert!(matches_git_status("git", "git status"));
        assert!(matches_git_status("git", "git status -sb"));
        assert!(matches_git_status("git", "git -C /repo status"));
        assert!(!matches_git_status("git", "git log"));
        assert!(!matches_git_status("git", "git"));
    }
}
