//! Tauri command surface for smart-action resolution.

use blaze_actions::{resolve, ResolvedAction};

#[tauri::command]
pub fn smart_action_for(path: String) -> Option<ResolvedAction> {
    resolve(&path)
}
