//! Tauri command surface for shell-integration install / uninstall / status.

use blaze_shell_integration::{self as si, Shell, ShellStatus};

#[tauri::command]
pub fn shell_integration_status() -> Vec<ShellStatus> {
    si::status_all()
}

#[tauri::command]
pub fn shell_integration_install(shell: Shell) -> Result<ShellStatus, String> {
    si::install(shell).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn shell_integration_uninstall(shell: Shell) -> Result<ShellStatus, String> {
    si::uninstall(shell).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn shell_integration_snippet(shell: Shell) -> &'static str {
    si::snippet(shell)
}
