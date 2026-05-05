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
  /** True when the active provider has all it needs to send a request. */
  ready: boolean;
  /** True when a cloud provider is selected but its API key isn't in the
   * keychain yet — prompts the AI dialog to ask for one. */
  needs_api_key: boolean;
}

export const aiTranslate = (prompt: string, shell?: string): Promise<TranslateResult> =>
  invoke<TranslateResult>("ai_translate", { args: { prompt, shell: shell ?? null } });

export const aiStatus = (): Promise<AiStatus> => invoke<AiStatus>("ai_status");

export const aiSetApiKey = (provider: string, key: string): Promise<void> =>
  invoke<void>("ai_set_api_key", { provider, key });

export const aiClearApiKey = (provider: string): Promise<void> =>
  invoke<void>("ai_clear_api_key", { provider });
