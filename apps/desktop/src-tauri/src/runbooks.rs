//! Tauri command surface for runbook discovery and loading.

use std::path::PathBuf;

use blaze_runbook::{
    list_runbooks, load_runbook, save_runbook, Runbook, RunbookSummary, SaveRequest, SaveResult,
    SaveStep,
};
use serde::Deserialize;

use crate::settings;

fn resolve_dir(override_dir: Option<String>) -> Option<PathBuf> {
    if let Some(dir) = override_dir {
        if !dir.is_empty() {
            return Some(PathBuf::from(dir));
        }
    }
    let cfg = settings::load();
    if let Some(d) = cfg.runbooks.dir.filter(|s| !s.is_empty()) {
        return Some(PathBuf::from(d));
    }
    dirs::document_dir().map(|p| p.join("Blaze").join("runbooks"))
}

#[tauri::command]
pub fn runbooks_list(dir: Option<String>) -> Result<Vec<RunbookSummary>, String> {
    let Some(path) = resolve_dir(dir) else {
        return Ok(Vec::new());
    };
    list_runbooks(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn runbooks_load(path: String) -> Result<Runbook, String> {
    load_runbook(&PathBuf::from(path)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn runbooks_dir() -> Option<String> {
    resolve_dir(None).map(|p| p.to_string_lossy().to_string())
}

#[derive(Debug, Deserialize)]
pub struct SaveArgs {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    pub steps: Vec<SaveStep>,
    /// Override directory; falls back to settings/default when empty.
    #[serde(default)]
    pub dir: Option<String>,
    #[serde(default)]
    pub overwrite: bool,
}

#[tauri::command]
pub fn runbooks_save(args: SaveArgs) -> Result<SaveResult, String> {
    let dir = resolve_dir(args.dir)
        .ok_or_else(|| "no runbook directory resolvable".to_string())?
        .to_string_lossy()
        .to_string();
    save_runbook(SaveRequest {
        name: args.name,
        description: args.description,
        steps: args.steps,
        dir,
        overwrite: args.overwrite,
    })
    .map_err(|e| e.to_string())
}
