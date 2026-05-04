import { invoke } from "@tauri-apps/api/core";

export type PaneTarget = "current" | "external";

export interface ResolvedAction {
  id: string;
  label: string;
  command: string;
  pane: PaneTarget;
  confirm: boolean;
}

export const smartActionFor = (path: string): Promise<ResolvedAction | null> =>
  invoke<ResolvedAction | null>("smart_action_for", { path });
