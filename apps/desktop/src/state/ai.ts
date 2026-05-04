import { invoke } from "@tauri-apps/api/core";

export interface TranslateResult {
  command: string;
  explanation: string | null;
  provider: string;
  model: string;
}

export interface AiStatus {
  enabled: boolean;
  provider: string;
  model: string;
}

export const aiTranslate = (prompt: string, shell?: string): Promise<TranslateResult> =>
  invoke<TranslateResult>("ai_translate", { args: { prompt, shell: shell ?? null } });

export const aiStatus = (): Promise<AiStatus> => invoke<AiStatus>("ai_status");
