import { useEffect, useRef, useState } from "react";
import {
  buildTransferCommand,
  resolveSourcePath,
  type TransferMode,
  type TransferRequest,
} from "../state/transfer";
import "./transfer.css";

interface Props {
  request: TransferRequest;
  onConfirm: (command: string) => void;
  onCancel: () => void;
}

/**
 * Modal that previews a pane-to-pane transfer before running it.
 *
 * Per spec §5.6.2: source, destination, resolved command, mode toggle.
 * The user can flip copy ↔ move in the dialog if they got the modifier
 * wrong while dragging. Conflict policy and rsync-with-progress remain
 * deferred to a follow-up batch.
 */
export function TransferConfirmDialog({ request, onConfirm, onCancel }: Props) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [mode, setMode] = useState<TransferMode>(request.mode);

  useEffect(() => {
    buttonRef.current?.focus();
  }, []);

  const sourceAbs = resolveSourcePath(request.source);
  const destDir = request.destCwd ?? "(unknown — destination has no cwd yet)";
  const command = buildTransferCommand({ ...request, mode });

  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
      return;
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onConfirm(command);
    }
  };

  const buttonLabel = mode === "move" ? "Move" : "Copy";

  return (
    <div className="picker-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="transfer-dialog"
        role="dialog"
        aria-label="Transfer file"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKey}
      >
        <div className="runbook-header">
          <div className="runbook-title">
            <span aria-hidden>📦</span>
            <span>{mode === "move" ? "Move to another pane" : "Copy to another pane"}</span>
          </div>
        </div>
        <div className="transfer-grid">
          <div className="transfer-field">
            <span className="transfer-label">Source</span>
            <code className="transfer-value" title={sourceAbs}>
              {sourceAbs}
            </code>
          </div>
          <div className="transfer-field">
            <span className="transfer-label">Destination</span>
            <code className="transfer-value" title={destDir}>
              {destDir}
            </code>
          </div>
          <div className="transfer-field">
            <span className="transfer-label">Mode</span>
            <div className="transfer-mode-row">
              <ModePill value="copy" current={mode} onSelect={setMode} hint="Source stays put" />
              <ModePill
                value="move"
                current={mode}
                onSelect={setMode}
                hint="Source removed after copy"
              />
            </div>
          </div>
          <div className="transfer-field">
            <span className="transfer-label">Command</span>
            <code className="transfer-value transfer-cmd" title={command}>
              {command}
            </code>
          </div>
        </div>
        {!request.destCwd && (
          <div className="transfer-warning">
            ⚠️ The destination pane hasn't reported a cwd yet (try pressing Enter in it once so the
            shell-integration hook fires). The command will run against the pane's actual cwd, but
            the preview above just shows <code>./</code>.
          </div>
        )}
        <div className="picker-footer">
          <span>
            <kbd>{navigator.platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl"}</kbd>+
            <kbd>Enter</kbd> to {buttonLabel.toLowerCase()} · <kbd>Esc</kbd> to cancel · hold{" "}
            <kbd>Shift</kbd> while dragging for move
          </span>
          <span className="picker-footer-spacer" />
          <button ref={buttonRef} className="runbook-run" onClick={() => onConfirm(command)}>
            {buttonLabel}
          </button>
          <button className="si-btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function ModePill({
  value,
  current,
  hint,
  onSelect,
}: {
  value: TransferMode;
  current: TransferMode;
  hint: string;
  onSelect: (m: TransferMode) => void;
}) {
  const active = value === current;
  return (
    <button
      className={`transfer-mode ${active ? "transfer-mode-active" : ""}`}
      onClick={() => onSelect(value)}
      title={hint}
      type="button"
    >
      {value === "copy" ? "📋 Copy" : "✂️ Move"}
    </button>
  );
}
