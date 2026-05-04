// Settings loaded once from the Rust side at boot. Mirrors the
// `apps/desktop/src-tauri/src/settings.rs` shape.

import { invoke } from "@tauri-apps/api/core";

export interface Appearance {
  font_family: string;
  font_size: number;
  line_height: number;
}

export interface TerminalCfg {
  scrollback_lines: number;
  shell: string | null;
  cursor_blink: boolean;
}

export interface Settings {
  appearance: Appearance;
  terminal: TerminalCfg;
}

export const defaultSettings = (): Settings => ({
  appearance: {
    font_family: 'ui-monospace, "SF Mono", Menlo, "Cascadia Mono", monospace',
    font_size: 13,
    line_height: 1.2,
  },
  terminal: {
    scrollback_lines: 100_000,
    shell: null,
    cursor_blink: true,
  },
});

export async function loadSettings(): Promise<Settings> {
  try {
    return await invoke<Settings>("settings_get");
  } catch (e) {
    console.warn("settings_get failed; using defaults:", e);
    return defaultSettings();
  }
}
