import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildTransferCommand,
  isProtectedPath,
  resolveSourcePath,
  SAFETY_PHRASE,
  type ConflictPolicy,
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
 * Confirm sheet for a pane-to-pane transfer.
 *
 * Shows source / destination / resolved command. Lets the user flip
 * copy ↔ move ↔ symlink (in case they got the modifier wrong while
 * dragging) and pick a conflict policy (overwrite vs skip-if-exists).
 *
 * If the destination is a protected path (`/`, `/etc`, the user's home
 * directory itself, …) the user must type `OVERWRITE` to enable the
 * confirm button — per spec §5.6.5.
 *
 * Still deferred to a follow-up: rsync-with-progress + cancel/resume,
 * multi-source drag, structured per-file-conflict prompts (rename / pick).
 */
export function TransferConfirmDialog({ request, onConfirm, onCancel }: Props) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [mode, setMode] = useState<TransferMode>(request.mode);
  const [conflict, setConflict] = useState<ConflictPolicy>(request.conflict);
  const [safetyTyped, setSafetyTyped] = useState("");

  const sourceAbs = resolveSourcePath(request.source);
  const destDir = request.destCwd ?? "(unknown — destination has no cwd yet)";
  const command = useMemo(
    () => buildTransferCommand({ ...request, mode, conflict }),
    [request, mode, conflict]
  );

  const protectedDest = useMemo(() => isProtectedPath(request.destCwd), [request.destCwd]);
  const safetyOk = !protectedDest || safetyTyped.trim() === SAFETY_PHRASE;
  const canConfirm = safetyOk;

  useEffect(() => {
    if (!protectedDest) buttonRef.current?.focus();
  }, [protectedDest]);

  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
      return;
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canConfirm) {
      e.preventDefault();
      onConfirm(command);
    }
  };

  const verb = mode === "move" ? "Move" : mode === "symlink" ? "Link" : "Copy";

  return (
    <div className="picker-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="transfer-dialog"
        role="dialog"
        aria-label={`${verb} file`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKey}
      >
        <div className="runbook-header">
          <div className="runbook-title">
            <span aria-hidden>📦</span>
            <span>{verb} to another pane</span>
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
              <ModePill
                value="symlink"
                current={mode}
                onSelect={setMode}
                hint="Create a symbolic link to the source"
              />
            </div>
          </div>
          {mode !== "symlink" && (
            <div className="transfer-field">
              <span className="transfer-label">If a file already exists</span>
              <div className="transfer-mode-row">
                <ConflictPill
                  value="overwrite"
                  current={conflict}
                  onSelect={setConflict}
                  hint="Replace the existing file"
                />
                <ConflictPill
                  value="skip"
                  current={conflict}
                  onSelect={setConflict}
                  hint={`No-clobber (${mode === "move" ? "mv -n" : "cp -n"})`}
                />
              </div>
            </div>
          )}
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
        {protectedDest && (
          <div className="transfer-danger">
            <strong>⛔ This destination is a system path.</strong> Writing here can break things you
            depend on. Type <code>{SAFETY_PHRASE}</code> below to enable the confirm button.
            <input
              type="text"
              className="picker-input transfer-safety-input"
              value={safetyTyped}
              onChange={(e) => setSafetyTyped(e.target.value)}
              placeholder={SAFETY_PHRASE}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        )}
        <div className="picker-footer">
          <span>
            <kbd>{navigator.platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl"}</kbd>+
            <kbd>Enter</kbd> to {verb.toLowerCase()} · <kbd>Esc</kbd> to cancel · drag with{" "}
            <kbd>Shift</kbd>=move <kbd>Alt</kbd>=symlink
          </span>
          <span className="picker-footer-spacer" />
          <button
            ref={buttonRef}
            className="runbook-run"
            disabled={!canConfirm}
            onClick={() => onConfirm(command)}
          >
            {verb}
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
      {value === "copy" ? "📋 Copy" : value === "move" ? "✂️ Move" : "🔗 Symlink"}
    </button>
  );
}

function ConflictPill({
  value,
  current,
  hint,
  onSelect,
}: {
  value: ConflictPolicy;
  current: ConflictPolicy;
  hint: string;
  onSelect: (p: ConflictPolicy) => void;
}) {
  const active = value === current;
  return (
    <button
      className={`transfer-mode ${active ? "transfer-mode-active" : ""}`}
      onClick={() => onSelect(value)}
      title={hint}
      type="button"
    >
      {value === "overwrite" ? "Overwrite" : "Skip"}
    </button>
  );
}
