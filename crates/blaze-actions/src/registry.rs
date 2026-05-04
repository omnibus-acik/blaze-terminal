//! Built-in smart-action registry plus path → action resolution.

use std::path::Path;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::template;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "snake_case"))]
pub enum PaneTarget {
    /// Run in the current pane (most cases — it's an interactive command).
    Current,
    /// Open in the OS default app via `open` (macOS) — used for images, PDFs.
    External,
}

#[derive(Debug, Clone)]
pub struct SmartAction {
    pub id: &'static str,
    pub label: &'static str,
    pub matcher: Matcher,
    pub template: &'static str,
    pub pane: PaneTarget,
    /// Whether to require a confirm sheet before running. Reserved for
    /// destructive verbs (rm/mv/dd/sudo) — none of the v0.1 defaults set it.
    pub confirm: bool,
}

#[derive(Debug, Clone)]
pub enum Matcher {
    /// Match when the basename equals this string (case-sensitive).
    ExactName(&'static str),
    /// Match when the basename ends with this suffix (case-insensitive).
    /// Examples: `.log`, `.tar.gz`, `rc`.
    Suffix(&'static str),
    /// Match when the basename starts with this prefix (case-insensitive).
    /// Examples: `README`, `.env`.
    Prefix(&'static str),
}

impl Matcher {
    fn matches(&self, basename: &str) -> bool {
        match self {
            Matcher::ExactName(s) => basename == *s,
            Matcher::Suffix(s) => basename.to_lowercase().ends_with(&s.to_lowercase()),
            Matcher::Prefix(s) => basename.to_lowercase().starts_with(&s.to_lowercase()),
        }
    }
}

/// Resolved (template-expanded) action ready to send to the PTY layer.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct ResolvedAction {
    pub id: String,
    pub label: String,
    pub command: String,
    pub pane: PaneTarget,
    pub confirm: bool,
}

/// Find the first matching smart action for `path` (against the built-in
/// registry) and expand its template. Returns `None` when no matcher fits.
pub fn resolve(path: &str) -> Option<ResolvedAction> {
    let basename = Path::new(path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(path);
    for action in builtin_actions() {
        if action.matcher.matches(basename) {
            let command = template::expand(action.template, path);
            return Some(ResolvedAction {
                id: action.id.to_string(),
                label: action.label.to_string(),
                command,
                pane: action.pane,
                confirm: action.confirm,
            });
        }
    }
    None
}

/// Default action registry. Order matters — first match wins, so place more
/// specific patterns (filenames, multi-part suffixes) ahead of broad ones.
pub fn builtin_actions() -> &'static [SmartAction] {
    &[
        // ---- specific filenames (highest priority) ----
        SmartAction {
            id: "dockerfile",
            label: "view Dockerfile",
            matcher: Matcher::ExactName("Dockerfile"),
            template: "${PAGER:-less} {path_q}",
            pane: PaneTarget::Current,
            confirm: false,
        },
        SmartAction {
            id: "docker-compose",
            label: "edit compose file",
            matcher: Matcher::ExactName("docker-compose.yml"),
            template: "${EDITOR:-vim} {path_q}",
            pane: PaneTarget::Current,
            confirm: false,
        },
        SmartAction {
            id: "docker-compose-yaml",
            label: "edit compose file",
            matcher: Matcher::ExactName("docker-compose.yaml"),
            template: "${EDITOR:-vim} {path_q}",
            pane: PaneTarget::Current,
            confirm: false,
        },
        SmartAction {
            id: "makefile",
            label: "list make targets",
            matcher: Matcher::ExactName("Makefile"),
            template:
                "make -pRrq -f {path_q} 2>/dev/null | awk -F: '/^[a-zA-Z0-9_.-]+:/ {{print $1}}' | sort -u",
            pane: PaneTarget::Current,
            confirm: false,
        },
        SmartAction {
            id: "justfile",
            label: "list just recipes",
            matcher: Matcher::ExactName("justfile"),
            template: "just --list -f {path_q}",
            pane: PaneTarget::Current,
            confirm: false,
        },
        SmartAction {
            id: "package-json",
            label: "list npm scripts",
            matcher: Matcher::ExactName("package.json"),
            template: "cat {path_q} | jq -r '.scripts | to_entries[] | \"\\(.key)\\t\\(.value)\"'",
            pane: PaneTarget::Current,
            confirm: false,
        },
        // ---- log files ----
        SmartAction {
            id: "log-tail",
            label: "tail -f log",
            matcher: Matcher::Suffix(".log"),
            template: "tail -f {path_q}",
            pane: PaneTarget::Current,
            confirm: false,
        },
        // ---- archives (specific multi-part suffixes BEFORE generic ones) ----
        SmartAction {
            id: "tarball-gz-list",
            label: "list .tar.gz contents",
            matcher: Matcher::Suffix(".tar.gz"),
            template: "tar tzf {path_q}",
            pane: PaneTarget::Current,
            confirm: false,
        },
        SmartAction {
            id: "tgz-list",
            label: "list .tgz contents",
            matcher: Matcher::Suffix(".tgz"),
            template: "tar tzf {path_q}",
            pane: PaneTarget::Current,
            confirm: false,
        },
        SmartAction {
            id: "tar-list",
            label: "list .tar contents",
            matcher: Matcher::Suffix(".tar"),
            template: "tar tf {path_q}",
            pane: PaneTarget::Current,
            confirm: false,
        },
        SmartAction {
            id: "zip-list",
            label: "list .zip contents",
            matcher: Matcher::Suffix(".zip"),
            template: "unzip -l {path_q}",
            pane: PaneTarget::Current,
            confirm: false,
        },
        // ---- markdown / readme ----
        SmartAction {
            id: "markdown-page",
            label: "page Markdown",
            matcher: Matcher::Suffix(".md"),
            template: "${PAGER:-less} {path_q}",
            pane: PaneTarget::Current,
            confirm: false,
        },
        SmartAction {
            id: "markdown-page-long",
            label: "page Markdown",
            matcher: Matcher::Suffix(".markdown"),
            template: "${PAGER:-less} {path_q}",
            pane: PaneTarget::Current,
            confirm: false,
        },
        SmartAction {
            id: "readme",
            label: "page README",
            matcher: Matcher::Prefix("README"),
            template: "${PAGER:-less} {path_q}",
            pane: PaneTarget::Current,
            confirm: false,
        },
        // ---- images / media (open in OS default) ----
        SmartAction {
            id: "img-png",
            label: "open image",
            matcher: Matcher::Suffix(".png"),
            template: "open {path_q}",
            pane: PaneTarget::External,
            confirm: false,
        },
        SmartAction {
            id: "img-jpg",
            label: "open image",
            matcher: Matcher::Suffix(".jpg"),
            template: "open {path_q}",
            pane: PaneTarget::External,
            confirm: false,
        },
        SmartAction {
            id: "img-jpeg",
            label: "open image",
            matcher: Matcher::Suffix(".jpeg"),
            template: "open {path_q}",
            pane: PaneTarget::External,
            confirm: false,
        },
        SmartAction {
            id: "img-gif",
            label: "open image",
            matcher: Matcher::Suffix(".gif"),
            template: "open {path_q}",
            pane: PaneTarget::External,
            confirm: false,
        },
        SmartAction {
            id: "img-webp",
            label: "open image",
            matcher: Matcher::Suffix(".webp"),
            template: "open {path_q}",
            pane: PaneTarget::External,
            confirm: false,
        },
        SmartAction {
            id: "img-svg",
            label: "open image",
            matcher: Matcher::Suffix(".svg"),
            template: "open {path_q}",
            pane: PaneTarget::External,
            confirm: false,
        },
        SmartAction {
            id: "pdf",
            label: "open PDF",
            matcher: Matcher::Suffix(".pdf"),
            template: "open {path_q}",
            pane: PaneTarget::External,
            confirm: false,
        },
        // ---- structured config (broad: edit) ----
        SmartAction {
            id: "edit-json",
            label: "edit",
            matcher: Matcher::Suffix(".json"),
            template: "${EDITOR:-vim} {path_q}",
            pane: PaneTarget::Current,
            confirm: false,
        },
        SmartAction {
            id: "edit-yaml",
            label: "edit",
            matcher: Matcher::Suffix(".yaml"),
            template: "${EDITOR:-vim} {path_q}",
            pane: PaneTarget::Current,
            confirm: false,
        },
        SmartAction {
            id: "edit-yml",
            label: "edit",
            matcher: Matcher::Suffix(".yml"),
            template: "${EDITOR:-vim} {path_q}",
            pane: PaneTarget::Current,
            confirm: false,
        },
        SmartAction {
            id: "edit-toml",
            label: "edit",
            matcher: Matcher::Suffix(".toml"),
            template: "${EDITOR:-vim} {path_q}",
            pane: PaneTarget::Current,
            confirm: false,
        },
        SmartAction {
            id: "edit-ini",
            label: "edit",
            matcher: Matcher::Suffix(".ini"),
            template: "${EDITOR:-vim} {path_q}",
            pane: PaneTarget::Current,
            confirm: false,
        },
        SmartAction {
            id: "edit-conf",
            label: "edit",
            matcher: Matcher::Suffix(".conf"),
            template: "${EDITOR:-vim} {path_q}",
            pane: PaneTarget::Current,
            confirm: false,
        },
        SmartAction {
            id: "edit-cfg",
            label: "edit",
            matcher: Matcher::Suffix(".cfg"),
            template: "${EDITOR:-vim} {path_q}",
            pane: PaneTarget::Current,
            confirm: false,
        },
        SmartAction {
            id: "edit-env",
            label: "edit (.env)",
            matcher: Matcher::Prefix(".env"),
            template: "${EDITOR:-vim} {path_q}",
            pane: PaneTarget::Current,
            confirm: false,
        },
        SmartAction {
            id: "edit-rc",
            label: "edit rcfile",
            matcher: Matcher::Suffix("rc"),
            template: "${EDITOR:-vim} {path_q}",
            pane: PaneTarget::Current,
            confirm: false,
        },
        // ---- code files (always edit, never auto-run per locked decision §5.5.4) ----
        SmartAction {
            id: "edit-sh",
            label: "edit script",
            matcher: Matcher::Suffix(".sh"),
            template: "${EDITOR:-vim} {path_q}",
            pane: PaneTarget::Current,
            confirm: false,
        },
        SmartAction {
            id: "edit-bash",
            label: "edit script",
            matcher: Matcher::Suffix(".bash"),
            template: "${EDITOR:-vim} {path_q}",
            pane: PaneTarget::Current,
            confirm: false,
        },
        SmartAction {
            id: "edit-py",
            label: "edit",
            matcher: Matcher::Suffix(".py"),
            template: "${EDITOR:-vim} {path_q}",
            pane: PaneTarget::Current,
            confirm: false,
        },
        SmartAction {
            id: "edit-rb",
            label: "edit",
            matcher: Matcher::Suffix(".rb"),
            template: "${EDITOR:-vim} {path_q}",
            pane: PaneTarget::Current,
            confirm: false,
        },
        SmartAction {
            id: "edit-js",
            label: "edit",
            matcher: Matcher::Suffix(".js"),
            template: "${EDITOR:-vim} {path_q}",
            pane: PaneTarget::Current,
            confirm: false,
        },
        SmartAction {
            id: "edit-ts",
            label: "edit",
            matcher: Matcher::Suffix(".ts"),
            template: "${EDITOR:-vim} {path_q}",
            pane: PaneTarget::Current,
            confirm: false,
        },
        SmartAction {
            id: "edit-tsx",
            label: "edit",
            matcher: Matcher::Suffix(".tsx"),
            template: "${EDITOR:-vim} {path_q}",
            pane: PaneTarget::Current,
            confirm: false,
        },
        SmartAction {
            id: "edit-jsx",
            label: "edit",
            matcher: Matcher::Suffix(".jsx"),
            template: "${EDITOR:-vim} {path_q}",
            pane: PaneTarget::Current,
            confirm: false,
        },
        SmartAction {
            id: "edit-rs",
            label: "edit",
            matcher: Matcher::Suffix(".rs"),
            template: "${EDITOR:-vim} {path_q}",
            pane: PaneTarget::Current,
            confirm: false,
        },
        SmartAction {
            id: "edit-go",
            label: "edit",
            matcher: Matcher::Suffix(".go"),
            template: "${EDITOR:-vim} {path_q}",
            pane: PaneTarget::Current,
            confirm: false,
        },
        SmartAction {
            id: "edit-sql",
            label: "edit",
            matcher: Matcher::Suffix(".sql"),
            template: "${EDITOR:-vim} {path_q}",
            pane: PaneTarget::Current,
            confirm: false,
        },
        SmartAction {
            id: "edit-csv",
            label: "edit",
            matcher: Matcher::Suffix(".csv"),
            template: "${EDITOR:-vim} {path_q}",
            pane: PaneTarget::Current,
            confirm: false,
        },
        SmartAction {
            id: "edit-tsv",
            label: "edit",
            matcher: Matcher::Suffix(".tsv"),
            template: "${EDITOR:-vim} {path_q}",
            pane: PaneTarget::Current,
            confirm: false,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_log_to_tail() {
        let r = resolve("logs/app.log").unwrap();
        assert_eq!(r.id, "log-tail");
        assert_eq!(r.command, "tail -f 'logs/app.log'");
        assert!(matches!(r.pane, PaneTarget::Current));
    }

    #[test]
    fn resolves_dockerfile_by_exact_name() {
        let r = resolve("/work/blaze/Dockerfile").unwrap();
        assert_eq!(r.id, "dockerfile");
    }

    #[test]
    fn resolves_tar_gz_before_gz() {
        // We don't have a `.gz` matcher, but verify multi-part suffix works.
        let r = resolve("backup-2026.tar.gz").unwrap();
        assert_eq!(r.id, "tarball-gz-list");
        assert_eq!(r.command, "tar tzf 'backup-2026.tar.gz'");
    }

    #[test]
    fn resolves_image_to_external() {
        let r = resolve("photo.JPG").unwrap();
        assert!(matches!(r.pane, PaneTarget::External));
        assert_eq!(r.command, "open 'photo.JPG'");
    }

    #[test]
    fn resolves_env_dotfile_via_prefix() {
        let r = resolve(".env.local").unwrap();
        assert_eq!(r.id, "edit-env");
    }

    #[test]
    fn resolves_zshrc_via_rc_suffix() {
        let r = resolve(".zshrc").unwrap();
        assert_eq!(r.id, "edit-rc");
    }

    #[test]
    fn unknown_returns_none() {
        assert!(resolve("mystery.xyz").is_none());
    }

    #[test]
    fn shell_quotes_paths_with_spaces() {
        let r = resolve("my logs/app.log").unwrap();
        assert_eq!(r.command, "tail -f 'my logs/app.log'");
    }
}
