import { invoke } from "@tauri-apps/api/core";

export type Shell = "zsh" | "bash" | "fish";
export type Status = "no_rcfile" | "not_installed" | "current" | "outdated";

export interface ShellStatus {
  shell: Shell;
  rcfile: string;
  status: Status;
}

export const fetchStatus = (): Promise<ShellStatus[]> =>
  invoke<ShellStatus[]>("shell_integration_status");

export const install = (shell: Shell): Promise<ShellStatus> =>
  invoke<ShellStatus>("shell_integration_install", { shell });

export const uninstall = (shell: Shell): Promise<ShellStatus> =>
  invoke<ShellStatus>("shell_integration_uninstall", { shell });

export const fetchSnippet = (shell: Shell): Promise<string> =>
  invoke<string>("shell_integration_snippet", { shell });
