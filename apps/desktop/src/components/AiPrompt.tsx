import { useEffect, useRef, useState } from "react";
import { aiStatus, aiTranslate, type AiStatus, type TranslateResult } from "../state/ai";
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
  | { kind: "error"; message: string };

/**
 * Cmd+K AI prompt. User types intent in English; we send to the
 * configured provider (Ollama in v0.1), show the translated command, and
 * let them Run / Edit / Cancel before anything hits the shell.
 *
 * Privacy: we send the typed prompt and an optional shell hint. No
 * scrollback, no command history, no env vars (per spec §5.7.3
 * default-strict mode).
 */
export function AiPrompt({ onRun, onClose }: Props) {
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "input" });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const editRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    aiStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    if (phase.kind === "input") inputRef.current?.focus();
    if (phase.kind === "result") {
      // Pre-select so the user can either run-as-is or type-over to edit.
      editRef.current?.focus();
      editRef.current?.select();
    }
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
            Add this to <code>~/.config/blaze/config.toml</code>, then make sure{" "}
            <code>ollama serve</code> is running:
            <pre>
              {`[ai]
enabled = true
provider = "ollama"
host = "http://localhost:11434"
model = "llama3.2"`}
            </pre>
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
        </div>
      </div>
    </div>
  );
}
