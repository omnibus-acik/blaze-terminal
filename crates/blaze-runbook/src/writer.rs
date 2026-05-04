//! Runbook serialization. Writes a `Runbook`-shaped object back to Markdown
//! that's `parse()`-roundtrippable.

use std::fs;
use std::path::{Path, PathBuf};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct SaveStep {
    pub title: String,
    pub command: String,
    #[cfg_attr(feature = "serde", serde(default))]
    pub language: Option<String>,
}

#[derive(Debug, Clone)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct SaveRequest {
    pub name: String,
    #[cfg_attr(feature = "serde", serde(default))]
    pub description: Option<String>,
    pub steps: Vec<SaveStep>,
    /// Directory to write into (caller resolves XDG / settings).
    pub dir: String,
    /// If false (the default), the writer picks a non-colliding filename
    /// like `name.md`, `name-2.md`, etc. If true, overwrites any existing
    /// `<slug>.md` in `dir`.
    #[cfg_attr(feature = "serde", serde(default))]
    pub overwrite: bool,
}

#[derive(Debug, Clone)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct SaveResult {
    pub path: String,
    pub filename: String,
}

#[derive(Debug, thiserror::Error)]
pub enum SaveError {
    #[error("name cannot be empty")]
    EmptyName,
    #[error("at least one step is required")]
    NoSteps,
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
}

pub fn save_runbook(req: SaveRequest) -> Result<SaveResult, SaveError> {
    if req.name.trim().is_empty() {
        return Err(SaveError::EmptyName);
    }
    if req.steps.iter().all(|s| s.command.trim().is_empty()) {
        return Err(SaveError::NoSteps);
    }

    let dir = PathBuf::from(&req.dir);
    fs::create_dir_all(&dir)?;

    let slug = slugify(&req.name);
    let (filename, path) = if req.overwrite {
        let fname = format!("{slug}.md");
        let p = dir.join(&fname);
        (fname, p)
    } else {
        pick_unique_path(&dir, &slug)
    };

    let body = serialize(&req);
    write_atomic(&path, &body)?;

    Ok(SaveResult {
        path: path.to_string_lossy().to_string(),
        filename,
    })
}

fn pick_unique_path(dir: &Path, slug: &str) -> (String, PathBuf) {
    let candidate = format!("{slug}.md");
    let p = dir.join(&candidate);
    if !p.exists() {
        return (candidate, p);
    }
    for i in 2..1000 {
        let candidate = format!("{slug}-{i}.md");
        let p = dir.join(&candidate);
        if !p.exists() {
            return (candidate, p);
        }
    }
    // Wildly unlikely. Fall back to overwriting.
    let candidate = format!("{slug}.md");
    let p = dir.join(&candidate);
    (candidate, p)
}

fn write_atomic(path: &Path, contents: &str) -> std::io::Result<()> {
    let tmp = path.with_extension("blaze.tmp");
    fs::write(&tmp, contents)?;
    fs::rename(&tmp, path)
}

fn serialize(req: &SaveRequest) -> String {
    let mut out = String::with_capacity(256);

    // Frontmatter: only emit fields the parser reads back.
    out.push_str("---\n");
    out.push_str(&format!("name: {}\n", yaml_escape(&req.name)));
    if let Some(desc) = req.description.as_deref().filter(|s| !s.trim().is_empty()) {
        out.push_str(&format!("description: {}\n", yaml_escape(desc)));
    }
    out.push_str("---\n\n");

    out.push_str(&format!("# {}\n\n", req.name));

    for (i, step) in req.steps.iter().enumerate() {
        let title = if step.title.trim().is_empty() {
            format!("Step {}", i + 1)
        } else {
            step.title.clone()
        };
        out.push_str(&format!("## {title}\n\n"));

        let lang = step
            .language
            .as_deref()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or("bash");
        let fence = pick_fence(&step.command);
        out.push_str(&format!("{fence}{lang}\n"));
        out.push_str(step.command.trim_end_matches('\n'));
        out.push('\n');
        out.push_str(&format!("{fence}\n\n"));
    }

    out
}

/// Choose a fence longer than any backtick run in the command body, so the
/// command itself can contain triple-backticks without breaking the runbook.
fn pick_fence(command: &str) -> String {
    let max_run = command.split(|c| c != '`').map(str::len).max().unwrap_or(0);
    "`".repeat(std::cmp::max(3, max_run + 1))
}

fn yaml_escape(s: &str) -> String {
    if s.is_empty() {
        return "\"\"".to_string();
    }
    if s.contains([':', '\n', '#', '\'', '"', '`'])
        || s.starts_with(['-', '?', '!', '[', '{', '*', '&'])
    {
        // Quote with double quotes, escape backslashes and double quotes.
        let escaped = s.replace('\\', "\\\\").replace('"', "\\\"");
        return format!("\"{escaped}\"");
    }
    s.to_string()
}

/// Convert a free-form name into a filesystem-safe slug.
pub fn slugify(name: &str) -> String {
    let mut out = String::with_capacity(name.len());
    let mut last_was_dash = false;
    for ch in name.trim().chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            last_was_dash = false;
        } else if (ch.is_whitespace() || ch == '-' || ch == '_')
            && !last_was_dash
            && !out.is_empty()
        {
            out.push('-');
            last_was_dash = true;
        }
        // Drop other characters (slashes, punctuation, emoji, etc.)
    }
    let trimmed = out.trim_end_matches('-').to_string();
    if trimmed.is_empty() {
        "runbook".to_string()
    } else {
        trimmed
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser;

    #[test]
    fn slug_basic() {
        assert_eq!(slugify("Deploy Staging"), "deploy-staging");
        assert_eq!(slugify("DB / Migration #1"), "db-migration-1");
        assert_eq!(slugify("  spaced  "), "spaced");
        assert_eq!(slugify("!!!"), "runbook");
    }

    #[test]
    fn fence_picks_longer_when_command_contains_backticks() {
        assert_eq!(pick_fence("echo hi"), "```");
        assert_eq!(pick_fence("printf '```hi'"), "````");
        assert_eq!(pick_fence("```nested```"), "````");
    }

    #[test]
    fn save_then_parse_roundtrips() {
        let dir =
            std::env::temp_dir().join(format!("blaze-runbook-roundtrip-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let req = SaveRequest {
            name: "Round Trip".to_string(),
            description: Some("test".to_string()),
            steps: vec![
                SaveStep {
                    title: "First".to_string(),
                    command: "echo hello".to_string(),
                    language: Some("bash".to_string()),
                },
                SaveStep {
                    title: "Second".to_string(),
                    command: "ls -la".to_string(),
                    language: None,
                },
            ],
            dir: dir.to_string_lossy().to_string(),
            overwrite: false,
        };
        let result = save_runbook(req).unwrap();
        assert!(result.filename.ends_with(".md"));
        let text = std::fs::read_to_string(&result.path).unwrap();
        let book = parser::parse(&text).unwrap();
        assert_eq!(book.name.as_deref(), Some("Round Trip"));
        assert_eq!(book.description.as_deref(), Some("test"));
        assert_eq!(book.steps.len(), 2);
        assert_eq!(book.steps[0].title, "First");
        assert_eq!(book.steps[0].command, "echo hello");
        assert_eq!(book.steps[1].command, "ls -la");
    }

    #[test]
    fn picks_unique_filename() {
        let dir = std::env::temp_dir().join(format!("blaze-runbook-unique-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let common = SaveStep {
            title: "x".to_string(),
            command: "x".to_string(),
            language: None,
        };
        let req1 = SaveRequest {
            name: "Same Name".to_string(),
            description: None,
            steps: vec![common.clone()],
            dir: dir.to_string_lossy().to_string(),
            overwrite: false,
        };
        let r1 = save_runbook(req1).unwrap();
        let req2 = SaveRequest {
            name: "Same Name".to_string(),
            description: None,
            steps: vec![common],
            dir: dir.to_string_lossy().to_string(),
            overwrite: false,
        };
        let r2 = save_runbook(req2).unwrap();
        assert_ne!(r1.filename, r2.filename);
        assert_eq!(r1.filename, "same-name.md");
        assert_eq!(r2.filename, "same-name-2.md");
    }

    #[test]
    fn empty_name_rejected() {
        let req = SaveRequest {
            name: "  ".to_string(),
            description: None,
            steps: vec![SaveStep {
                title: "x".to_string(),
                command: "x".to_string(),
                language: None,
            }],
            dir: "/tmp".to_string(),
            overwrite: false,
        };
        assert!(matches!(save_runbook(req), Err(SaveError::EmptyName)));
    }
}
