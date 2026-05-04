//! Filesystem layer: list `*.md` runbooks in a directory and load one.
//!
//! Errors that happen reading individual entries are logged and skipped so
//! the picker can still show the rest of the directory; only directory-level
//! errors (nonexistent / unreadable) propagate.

use std::fs;
use std::path::{Path, PathBuf};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::parser::{parse, Runbook};

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct RunbookSummary {
    pub path: PathBuf,
    pub name: String,
    pub description: Option<String>,
    pub step_count: usize,
}

pub fn list_runbooks(dir: &Path) -> std::io::Result<Vec<RunbookSummary>> {
    let mut summaries = Vec::new();
    if !dir.exists() {
        return Ok(summaries);
    }
    let entries = fs::read_dir(dir)?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !is_markdown(&path) {
            continue;
        }
        let Ok(text) = fs::read_to_string(&path) else {
            tracing::warn!(target: "runbook", "could not read {}", path.display());
            continue;
        };
        let book = parse(&text).unwrap_or(Runbook {
            name: None,
            description: None,
            steps: Vec::new(),
        });
        let name = book
            .name
            .clone()
            .unwrap_or_else(|| filename_stem(&path).unwrap_or_else(|| "(unnamed)".to_string()));
        summaries.push(RunbookSummary {
            path,
            name,
            description: book.description,
            step_count: book.steps.len(),
        });
    }
    summaries.sort_by_key(|s| s.name.to_lowercase());
    Ok(summaries)
}

pub fn load_runbook(path: &Path) -> std::io::Result<Runbook> {
    let text = fs::read_to_string(path)?;
    Ok(parse(&text).unwrap_or(Runbook {
        name: None,
        description: None,
        steps: Vec::new(),
    }))
}

fn is_markdown(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|e| e.to_str()).map(str::to_ascii_lowercase),
        Some(ref ext) if ext == "md" || ext == "markdown"
    )
}

fn filename_stem(path: &Path) -> Option<String> {
    path.file_stem()
        .and_then(|s| s.to_str())
        .map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn write(dir: &Path, name: &str, contents: &str) -> PathBuf {
        let path = dir.join(name);
        let mut f = fs::File::create(&path).unwrap();
        f.write_all(contents.as_bytes()).unwrap();
        path
    }

    #[test]
    fn lists_md_files_with_metadata() {
        let tmp = tempdir();
        write(
            &tmp,
            "deploy.md",
            "---\nname: Deploy\n---\n\n```bash\nmake\n```\n",
        );
        write(&tmp, "notes.txt", "ignored");
        write(&tmp, "untitled.markdown", "```bash\nls\n```\n");

        let mut summaries = list_runbooks(&tmp).unwrap();
        summaries.sort_by(|a, b| a.path.cmp(&b.path));
        assert_eq!(summaries.len(), 2);
        assert!(summaries.iter().any(|s| s.name == "Deploy"));
        assert!(summaries.iter().any(|s| s.name == "untitled"));
    }

    #[test]
    fn handles_missing_dir() {
        let summaries = list_runbooks(Path::new("/this/path/does/not/exist")).unwrap();
        assert!(summaries.is_empty());
    }

    fn tempdir() -> PathBuf {
        let p = std::env::temp_dir().join(format!("blaze-runbook-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p
    }
}
