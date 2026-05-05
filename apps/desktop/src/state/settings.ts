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

/** Named environment preset. Drives tab accent + xterm theme + spawn args. */
export interface Profile {
  id: string;
  name: string;
  /** Accent (CSS hex). Drives tab dot + active-pane border. */
  color: string | null;
  /** xterm foreground override. */
  foreground: string | null;
  /** xterm background override. */
  background: string | null;
  /** xterm cursor override. */
  cursor: string | null;
  /** Shell binary override at spawn. */
  shell: string | null;
  /** Default cwd at spawn (`~` is expanded by the Rust side). */
  cwd: string | null;
}

export interface Settings {
  appearance: Appearance;
  terminal: TerminalCfg;
  profiles: Profile[];
  default_profile_id: string | null;
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
  profiles: [
    {
      id: "default",
      name: "Default",
      color: null,
      foreground: null,
      background: null,
      cursor: null,
      shell: null,
      cwd: null,
    },
  ],
  default_profile_id: "default",
});

export async function loadSettings(): Promise<Settings> {
  try {
    return await invoke<Settings>("settings_get");
  } catch (e) {
    console.warn("settings_get failed; using defaults:", e);
    return defaultSettings();
  }
}
