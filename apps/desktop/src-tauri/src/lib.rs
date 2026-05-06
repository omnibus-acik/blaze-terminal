mod ai;
mod git;
mod pty;
mod runbooks;
mod secrets;
mod settings;
mod shell_integration;
mod smart_actions;
mod ssh;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(pty::PtyRegistry::default())
        .invoke_handler(tauri::generate_handler![
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            settings::settings_get,
            shell_integration::shell_integration_status,
            shell_integration::shell_integration_install,
            shell_integration::shell_integration_uninstall,
            shell_integration::shell_integration_snippet,
            smart_actions::smart_action_for,
            runbooks::runbooks_list,
            runbooks::runbooks_load,
            runbooks::runbooks_dir,
            runbooks::runbooks_save,
            secrets::secret_get,
            secrets::secret_set,
            secrets::secret_delete,
            ai::ai_translate,
            ai::ai_status,
            ai::ai_set_api_key,
            ai::ai_clear_api_key,
            git::git_info,
            git::git_branches,
            ssh::ssh_hosts,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
