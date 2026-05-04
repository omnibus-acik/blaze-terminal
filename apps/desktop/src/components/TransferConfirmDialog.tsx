import { useEffect, useRef } from "react";
import { buildTransferCommand, resolveSourcePath, type TransferRequest } from "../state/transfer";
import "./transfer.css";

interface Props {
  request: TransferRequest;
  onConfirm: (command: string) => void;
  onCancel: () => void;
}

/**
 * Modal that previews a pane-to-pane transfer before running it.
 *
 * Per spec §5.6.2 the confirm sheet always shows: source list, destination
 * path, the resolved command, and lets the user cancel. v0.1 ships
 * read-only — no overwrite/skip/rename toggles, no move/symlink mode (those
 * are next-batch). Dropping a file you already have at the destination
 * lets `cp -p` do its default thing (overwrite). We'll expose conflict
 * policy in a subsequent batch.
 */
export function TransferConfirmDialog({ request, onConfirm, onCancel }: Props) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    buttonRef.current?.focus();
  }, []);

  const sourceAbs = resolveSourcePath(request.source);
  const destDir = request.destCwd ?? "(unknown — destination has no cwd yet)";
  const command = buildTransferCommand(request);

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
            <span>Copy to another pane</span>
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
            <kbd>Enter</kbd> to copy · <kbd>Esc</kbd> to cancel
          </span>
          <span className="picker-footer-spacer" />
          <button ref={buttonRef} className="runbook-run" onClick={() => onConfirm(command)}>
            Copy
          </button>
          <button className="si-btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
