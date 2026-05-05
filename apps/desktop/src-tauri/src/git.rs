//! Per-pane git status snapshot, gathered by shelling out to the user's
//! `git` binary. Returned to the frontend as a structured `GitInfo` so the
//! status bar can render branch, ahead/behind, dirty counts, etc.
//!
//! We use `git status --porcelain=v2 --branch --show-stash` because:
//! - `--porcelain=v2` is a stable machine-readable format (unlike v1 / human)
//! - `--branch` gives us oid / head / upstream / ab in `# branch.*` headers
//! - `--show-stash` gives us a `# stash <N>` header
//!
//! `GIT_OPTIONAL_LOCKS=0` skips taking the index lock when possible, which
//! keeps us safe to run while the user is doing their own git ops.

use serde::Serialize;

#[derive(Debug, Default, Clone, Serialize)]
pub struct GitInfo {
    /// Branch name, `(detached)`, or empty when there's no branch.
    pub branch: String,
    /// First 7 chars of HEAD oid.
    pub head_short: String,
    /// Upstream ref name, e.g. `origin/main`.
    pub upstream: Option<String>,
    /// Commits in HEAD that aren't in upstream.
    pub ahead: u32,
    /// Commits in upstream that aren't in HEAD.
    pub behind: u32,
    /// Tracked files with staged changes.
    pub staged: u32,
    /// Tracked files with unstaged changes.
    pub unstaged: u32,
    /// `??` entries.
    pub untracked: u32,
    /// Files with merge conflicts.
    pub conflicts: u32,
    /// Number of stash entries.
    pub stash: u32,
    /// True when HEAD is detached.
    pub detached: bool,
}

#[tauri::command]
pub async fn git_info(path: String) -> Option<GitInfo> {
    if path.is_empty() {
        return None;
    }
    tauri::async_runtime::spawn_blocking(move || git_info_blocking(&path))
        .await
        .ok()
        .flatten()
}

fn git_info_blocking(path: &str) -> Option<GitInfo> {
    let output = std::process::Command::new("git")
        .args([
            "-C",
            path,
            "status",
            "--porcelain=v2",
            "--branch",
            "--show-stash",
        ])
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("LC_ALL", "C") // make headers stable across locales
        .output()
        .ok()?;
    if !output.status.success() {
        // Either not a git repo, git not installed, or path doesn't exist.
        return None;
    }
    let text = std::str::from_utf8(&output.stdout).ok()?;
    parse_porcelain_v2(text)
}

fn parse_porcelain_v2(text: &str) -> Option<GitInfo> {
    let mut info = GitInfo::default();
    let mut saw_branch = false;

    for line in text.lines() {
        if let Some(rest) = line.strip_prefix("# branch.oid ") {
            saw_branch = true;
            let oid = rest.trim();
            info.head_short = oid.chars().take(7).collect();
        } else if let Some(rest) = line.strip_prefix("# branch.head ") {
            saw_branch = true;
            let head = rest.trim();
            if head == "(detached)" {
                info.detached = true;
                info.branch = "(detached)".to_string();
            } else {
                info.branch = head.to_string();
            }
        } else if let Some(rest) = line.strip_prefix("# branch.upstream ") {
            info.upstream = Some(rest.trim().to_string());
        } else if let Some(rest) = line.strip_prefix("# branch.ab ") {
            // Format: "+N -M"
            let parts: Vec<&str> = rest.split_whitespace().collect();
            if let Some(p) = parts.first() {
                info.ahead = p.trim_start_matches('+').parse().unwrap_or(0);
            }
            if let Some(p) = parts.get(1) {
                info.behind = p.trim_start_matches('-').parse().unwrap_or(0);
            }
        } else if let Some(rest) = line.strip_prefix("# stash ") {
            info.stash = rest.trim().parse().unwrap_or(0);
        } else if line.starts_with("1 ") || line.starts_with("2 ") {
            // Tracked entry: `1 XY ...` or `2 XY ...` (renamed/copied).
            // XY is "<index><worktree>" status.
            let tokens: Vec<&str> = line.split_whitespace().collect();
            if let Some(xy) = tokens.get(1) {
                let chars: Vec<char> = xy.chars().collect();
                if chars.len() >= 2 {
                    let x = chars[0];
                    let y = chars[1];
                    if x == 'U' || y == 'U' {
                        info.conflicts += 1;
                    } else {
                        if x != '.' {
                            info.staged += 1;
                        }
                        if y != '.' {
                            info.unstaged += 1;
                        }
                    }
                }
            }
        } else if line.starts_with("u ") {
            // Unmerged entry — always a conflict.
            info.conflicts += 1;
        } else if line.starts_with("? ") {
            info.untracked += 1;
        }
        // `! path` (ignored) and any other line is silently skipped.
    }

    if !saw_branch {
        // No branch headers means git wasn't actually run successfully —
        // fall through as "not a repo" rather than emit zeros.
        return None;
    }
    Some(info)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_clean_repo() {
        let s = "\
# branch.oid abcdef1234567890
# branch.head main
# branch.upstream origin/main
# branch.ab +0 -0
";
        let info = parse_porcelain_v2(s).unwrap();
        assert_eq!(info.branch, "main");
        assert_eq!(info.head_short, "abcdef1");
        assert_eq!(info.upstream.as_deref(), Some("origin/main"));
        assert_eq!(info.ahead, 0);
        assert_eq!(info.behind, 0);
        assert_eq!(info.staged + info.unstaged + info.untracked, 0);
    }

    #[test]
    fn parses_dirty_repo_with_stash() {
        let s = "\
# branch.oid 1234567abcdef
# branch.head feature/x
# branch.upstream origin/feature/x
# branch.ab +3 -1
# stash 2
1 .M N... 100644 100644 100644 aaa bbb src/main.rs
1 M. N... 100644 100644 100644 ccc ddd README.md
1 MM N... 100644 100644 100644 eee fff lib.rs
? new-file.txt
? another.log
! ignored.bin
";
        let info = parse_porcelain_v2(s).unwrap();
        assert_eq!(info.branch, "feature/x");
        assert_eq!(info.ahead, 3);
        assert_eq!(info.behind, 1);
        // src/main.rs (.M) → unstaged. README.md (M.) → staged. lib.rs (MM) → both.
        assert_eq!(info.staged, 2);
        assert_eq!(info.unstaged, 2);
        assert_eq!(info.untracked, 2);
        assert_eq!(info.stash, 2);
        assert_eq!(info.conflicts, 0);
    }

    #[test]
    fn parses_detached_head() {
        let s = "\
# branch.oid abcdef1
# branch.head (detached)
";
        let info = parse_porcelain_v2(s).unwrap();
        assert!(info.detached);
        assert_eq!(info.branch, "(detached)");
        assert!(info.upstream.is_none());
    }

    #[test]
    fn parses_conflicts() {
        let s = "\
# branch.oid 0000000
# branch.head main
1 UU N... 100644 100644 100644 aaa bbb conflict.rs
u UU N... 100644 100644 100644 100644 aaa bbb ccc unmerged.rs
";
        let info = parse_porcelain_v2(s).unwrap();
        assert_eq!(info.conflicts, 2);
        assert_eq!(info.staged + info.unstaged, 0);
    }

    #[test]
    fn returns_none_for_non_repo_output() {
        // git would have failed and we'd never call the parser, but if we
        // did get empty input, we should still bail.
        assert!(parse_porcelain_v2("").is_none());
        assert!(parse_porcelain_v2("not a git output").is_none());
    }
}
