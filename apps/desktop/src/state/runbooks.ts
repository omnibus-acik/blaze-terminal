import { invoke } from "@tauri-apps/api/core";

export interface RunbookSummary {
  path: string;
  name: string;
  description: string | null;
  step_count: number;
}

export type StepMode = "auto" | "manual";

export interface Step {
  title: string;
  command: string;
  language: string;
  mode: StepMode;
  /** Optional shell condition from `blaze: if=…` / `unless=…`. */
  condition: string | null;
  /** True when the directive was `unless=…` (negate the exit status). */
  negate: boolean;
}

export interface Runbook {
  name: string | null;
  description: string | null;
  steps: Step[];
}

export const listRunbooks = (): Promise<RunbookSummary[]> => invoke("runbooks_list", {});
export const loadRunbook = (path: string): Promise<Runbook> => invoke("runbooks_load", { path });
export const runbooksDir = (): Promise<string | null> => invoke("runbooks_dir");

// ---- save ----

export interface SaveStep {
  title: string;
  command: string;
  language?: string | null;
}

export interface SaveArgs {
  name: string;
  description?: string | null;
  steps: SaveStep[];
  dir?: string | null;
  overwrite?: boolean;
}

export interface SaveResult {
  path: string;
  filename: string;
}

export const saveRunbook = (args: SaveArgs): Promise<SaveResult> =>
  invoke<SaveResult>("runbooks_save", { args });
