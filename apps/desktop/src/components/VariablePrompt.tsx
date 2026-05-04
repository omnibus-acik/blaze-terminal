import { useEffect, useRef, useState } from "react";
import { secretSet, type Variable } from "../state/variables";
import "./runbook.css";

interface Props {
  stepTitle: string;
  variables: Variable[];
  /** Pre-fill values from the session-scoped cache. */
  initial: Record<string, string>;
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
}

/**
 * Modal that asks the user to fill in `{{var}}` placeholders before a
 * runbook step runs. Secret variables are saved to the OS keychain on
 * submit (toggleable per field) so subsequent runs don't re-prompt.
 */
export function VariablePrompt({ stepTitle, variables, initial, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const seeded: Record<string, string> = {};
    for (const v of variables) {
      seeded[v.name] = initial[v.name] ?? "";
    }
    return seeded;
  });
  const [persistSecret, setPersistSecret] = useState<Record<string, boolean>>(() => {
    const seeded: Record<string, boolean> = {};
    for (const v of variables) if (v.isSecret) seeded[v.name] = true;
    return seeded;
  });
  const [submitting, setSubmitting] = useState(false);
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    firstInputRef.current?.focus();
    firstInputRef.current?.select();
  }, []);

  const allFilled = variables.every((v) => values[v.name]?.trim().length > 0);

  const submit = async () => {
    if (!allFilled || submitting) return;
    setSubmitting(true);
    // Best-effort save to keychain — never block returning the values to
    // the runner, even if the keychain write fails (we still hold the
    // value in memory for the session).
    await Promise.all(
      variables
        .filter((v) => v.isSecret && persistSecret[v.name])
        .map(async (v) => {
          try {
            await secretSet(v.name, values[v.name]);
          } catch (e) {
            console.warn(`secret_set(${v.name}) failed:`, e);
          }
        })
    );
    onSubmit(values);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && allFilled) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <div className="picker-backdrop var-prompt-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="var-prompt"
        role="dialog"
        aria-label="Step variables"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKey}
      >
        <div className="runbook-header">
          <div className="runbook-title">
            <span aria-hidden>🔣</span>
            <span>Fill in variables</span>
          </div>
          <span className="runbook-desc">For step "{stepTitle}"</span>
        </div>
        <div className="var-prompt-fields">
          {variables.map((v, idx) => (
            <div className="save-field" key={v.name}>
              <label>
                <span>
                  <code>{v.name}</code>
                  {v.isSecret && <span className="var-secret-tag">secret</span>}
                </span>
                <input
                  ref={idx === 0 ? firstInputRef : null}
                  type={v.isSecret ? "password" : "text"}
                  className="picker-input"
                  value={values[v.name] ?? ""}
                  onChange={(e) => setValues((prev) => ({ ...prev, [v.name]: e.target.value }))}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              {v.isSecret && (
                <label className="var-keychain-opt">
                  <input
                    type="checkbox"
                    checked={persistSecret[v.name] ?? true}
                    onChange={(e) =>
                      setPersistSecret((prev) => ({ ...prev, [v.name]: e.target.checked }))
                    }
                  />
                  <span>Save to OS keychain (won't ask again)</span>
                </label>
              )}
            </div>
          ))}
        </div>
        <div className="picker-footer">
          <span>
            {variables.length} variable{variables.length === 1 ? "" : "s"}
          </span>
          <span className="picker-footer-spacer" />
          <button
            className="runbook-run"
            disabled={!allFilled || submitting}
            onClick={() => void submit()}
          >
            {submitting ? "Saving…" : "Submit"}
          </button>
          <button className="si-btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
