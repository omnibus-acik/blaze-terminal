import { useEffect, useRef, useState } from "react";
import {
  aiSetApiKey,
  aiStatus,
  aiTranslate,
  type AiStatus,
  type TranslateResult,
} from "../state/ai";
import "./ai-prompt.css";

interface Props {
  /** Called with the final command — caller writes it to the active PTY. */
  onRun: (command: string) => void;
  onClose: () => void;
}

type Phase =
  | { kind: "input" }
  | { kind: "translating" }
  | { kind: "result"; result: TranslateResult; edited: string }
  | { kind: "error"; message: string }
  | { kind: "needs_api_key"; provider: string; saving: boolean; error: string | null };

const PROVIDER_KEY_HELP: Record<string, { label: string; hint: string }> = {
  claude: {
    label: "Anthropic API key",
    hint: "Find or create one at https://console.anthropic.com/settings/keys",
  },
  openai: {
    label: "OpenAI API key",
    hint: "Find or create one at https://platform.openai.com/api-keys",
  },
};

/**
 * Cmd+K AI prompt. User types intent in English; we send to the configured
 * provider (Ollama / Claude / OpenAI), show the translated command, and let
 * them Run / Edit / Cancel before anything hits the shell.
 *
 * Privacy: only the typed prompt + an optional shell hint go to the
 * provider — no scrollback, history, or env vars. (Spec §5.7.3 strict
 * default mode.) API keys for cloud providers live in the OS keychain via
 * the existing `secrets` Tauri commands.
 */
export function AiPrompt({ onRun, onClose }: Props) {
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "input" });
  const [keyInput, setKeyInput] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const editRef = useRef<HTMLInputElement | null>(null);
  const keyInputRef = useRef<HTMLInputElement | null>(null);

  const refreshStatus = () =>
    aiStatus()
      .then((s) => {
        setStatus(s);
        if (s.enabled && s.needs_api_key) {
          setPhase({
            kind: "needs_api_key",
            provider: s.provider,
            saving: false,
            error: null,
          });
        }
      })
      .catch(() => setStatus(null));

  useEffect(() => {
    void refreshStatus();
  }, []);

  useEffect(() => {
    if (phase.kind === "input") inputRef.current?.focus();
    if (phase.kind === "result") {
      editRef.current?.focus();
      editRef.current?.select();
    }
    if (phase.kind === "needs_api_key") keyInputRef.current?.focus();
  }, [phase.kind]);

  const submit = async () => {
    const text = prompt.trim();
    if (!text || phase.kind === "translating") return;
    setPhase({ kind: "translating" });
    try {
      const result = await aiTranslate(text);
      setPhase({ kind: "result", result, edited: result.command });
    } catch (e) {
      setPhase({ kind: "error", message: String(e) });
    }
  };

  const submitApiKey = async () => {
    if (phase.kind !== "needs_api_key") return;
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    setPhase({ ...phase, saving: true, error: null });
    try {
      await aiSetApiKey(phase.provider, trimmed);
      setKeyInput("");
      // Refresh status to flip needs_api_key → false, then return to input.
      await refreshStatus();
      setPhase({ kind: "input" });
    } catch (e) {
      setPhase({ ...phase, saving: false, error: String(e) });
    }
  };

  const run = (cmd: string) => {
    if (!cmd.trim()) return;
    onRun(cmd);
    onClose();
  };

  const handleInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  const handleEditKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "Enter" && phase.kind === "result") {
      e.preventDefault();
      run(phase.edited);
    }
  };

  const handleKeyInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      void submitApiKey();
    }
  };

  return (
    <div className="picker-backdrop ai-backdrop" role="presentation" onClick={onClose}>
      <div
        className="ai-prompt"
        role="dialog"
        aria-label="AI prompt"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ai-prompt-header">
          <span className="ai-prompt-icon" aria-hidden>
            ✨
          </span>
          <span>Translate to a shell command</span>
          <span className="ai-prompt-spacer" />
          {status?.enabled && (
            <span
              className="ai-prompt-tag"
              title={`Provider: ${status.provider}\nModel: ${status.model}`}
            >
              {status.provider}/{status.model}
            </span>
          )}
        </div>

        {status && !status.enabled && (
          <div className="ai-prompt-warning">
            <strong>AI is disabled.</strong>
            <br />
            Add a <code>[ai]</code> block to <code>~/.config/blaze/config.toml</code> and pick a
            provider (one of the three blocks below):
            <pre>
              {`[ai]
enabled = true

# Local — runs entirely on your machine. No keys.
provider = "ollama"
host = "http://localhost:11434"
model = "llama3.2"

# Or, Anthropic Claude (cloud — paste your key in the dialog)
# provider = "claude"
# model = "claude-haiku-4-5"

# Or, OpenAI (cloud — paste your key in the dialog)
# provider = "openai"
# model = "gpt-4o-mini"`}
            </pre>
          </div>
        )}

        {phase.kind === "needs_api_key" && (
          <div className="ai-prompt-keyform">
            <div className="ai-prompt-section-label">
              {PROVIDER_KEY_HELP[phase.provider]?.label ?? `${phase.provider} API key`}
            </div>
            <input
              ref={keyInputRef}
              className="ai-prompt-input ai-prompt-cmd"
              type="password"
              placeholder={
                phase.provider === "claude"
                  ? "sk-ant-…"
                  : phase.provider === "openai"
                    ? "sk-…"
                    : "key"
              }
              value={keyInput}
              disabled={phase.saving}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={handleKeyInputKey}
              autoComplete="off"
              spellCheck={false}
            />
            <p className="ai-prompt-explain">
              Stored in your OS keychain (
              {navigator.platform.toLowerCase().includes("mac") ? "Keychain" : "Secret Service"}).
              Never written to disk.{" "}
              {PROVIDER_KEY_HELP[phase.provider]?.hint && (
                <span className="ai-prompt-keyhint">{PROVIDER_KEY_HELP[phase.provider]?.hint}</span>
              )}
            </p>
            {phase.error && (
              <div className="ai-prompt-error">
                <strong>Couldn't save the key.</strong>
                <br />
                {phase.error}
              </div>
            )}
          </div>
        )}

        {(phase.kind === "input" || phase.kind === "translating") && (
          <input
            ref={inputRef}
            className="ai-prompt-input"
            type="text"
            value={prompt}
            disabled={phase.kind === "translating" || (status !== null && !status.enabled)}
            placeholder='e.g. "find all PDFs modified this week"'
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleInputKey}
          />
        )}

        {phase.kind === "translating" && (
          <div className="ai-prompt-status">
            <span className="ai-prompt-spinner" aria-hidden />
            <span>Translating with {status?.model ?? "model"}…</span>
          </div>
        )}

        {phase.kind === "result" && (
          <>
            <div className="ai-prompt-section-label">Translated command</div>
            <input
              ref={editRef}
              className="ai-prompt-input ai-prompt-cmd"
              type="text"
              value={phase.edited}
              onChange={(e) =>
                setPhase({
                  kind: "result",
                  result: phase.result,
                  edited: e.target.value,
                })
              }
              onKeyDown={handleEditKey}
            />
            {phase.result.explanation && (
              <p className="ai-prompt-explain">{phase.result.explanation}</p>
            )}
          </>
        )}

        {phase.kind === "error" && (
          <div className="ai-prompt-error">
            <strong>Translation failed.</strong>
            <br />
            {phase.message}
          </div>
        )}

        <div className="picker-footer">
          {phase.kind === "input" && (
            <>
              <span>
                <kbd>Enter</kbd> to translate · <kbd>Esc</kbd> to cancel
              </span>
              <span className="picker-footer-spacer" />
              <button
                className="runbook-run"
                disabled={!prompt.trim() || (status !== null && !status.enabled)}
                onClick={() => void submit()}
              >
                Translate
              </button>
              <button className="si-btn" onClick={onClose}>
                Cancel
              </button>
            </>
          )}
          {phase.kind === "translating" && (
            <>
              <span>Talking to {status?.provider ?? "model"}…</span>
              <span className="picker-footer-spacer" />
              <button className="si-btn" onClick={onClose}>
                Cancel
              </button>
            </>
          )}
          {phase.kind === "result" && (
            <>
              <span>
                <kbd>Enter</kbd> to run · edit inline before running · <kbd>Esc</kbd> to cancel
              </span>
              <span className="picker-footer-spacer" />
              <button
                className="runbook-run"
                disabled={!phase.edited.trim()}
                onClick={() => run(phase.edited)}
              >
                Run
              </button>
              <button className="si-btn" onClick={() => setPhase({ kind: "input" })}>
                Try again
              </button>
              <button className="si-btn" onClick={onClose}>
                Cancel
              </button>
            </>
          )}
          {phase.kind === "error" && (
            <>
              <span className="picker-footer-spacer" />
              <button className="si-btn" onClick={() => setPhase({ kind: "input" })}>
                Try again
              </button>
              <button className="si-btn" onClick={onClose}>
                Close
              </button>
            </>
          )}
          {phase.kind === "needs_api_key" && (
            <>
              <span>
                <kbd>Enter</kbd> to save · <kbd>Esc</kbd> to cancel
              </span>
              <span className="picker-footer-spacer" />
              <button
                className="runbook-run"
                disabled={!keyInput.trim() || phase.saving}
                onClick={() => void submitApiKey()}
              >
                {phase.saving ? "Saving…" : "Save key"}
              </button>
              <button className="si-btn" onClick={onClose}>
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
