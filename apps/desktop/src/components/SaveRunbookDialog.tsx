import { useEffect, useRef, useState } from "react";
import { saveRunbook, type SaveResult } from "../state/runbooks";
import type { BlockSnapshot } from "../blocks";
import "./runbook.css";

interface Props {
  /** Snapshots of recent done blocks, newest-first. */
  snapshots: BlockSnapshot[];
  onSaved: (result: SaveResult) => void;
  onClose: () => void;
}

interface RowState {
  /** Stable id keyed off the original block index. */
  id: number;
  selected: boolean;
  title: string;
  command: string;
  exitCode: number | null;
}

/**
 * Modal that lets the user pick a sequence of recently-run commands and
 * save them as a Markdown runbook. Closes the capture-replay loop —
 * commands run in the terminal can be promoted to a reusable runbook in two
 * clicks.
 */
export function SaveRunbookDialog({ snapshots, onSaved, onClose }: Props) {
  // Render newest-first so the most recent command is on top, but we'll
  // reverse the *selected* set on save so steps run in chronological order.
  const [rows, setRows] = useState<RowState[]>(() =>
    snapshots.map((s) => ({
      id: s.index,
      selected: true,
      title: deriveTitle(s.command),
      command: s.command,
      exitCode: s.exitCode,
    }))
  );
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  const selectedCount = rows.filter((r) => r.selected).length;
  const canSave = !saving && name.trim().length > 0 && selectedCount > 0;

  const toggle = (id: number) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r)));
  };
  const setRowTitle = (id: number, title: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, title } : r)));
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const selected = rows
        .filter((r) => r.selected)
        // Reverse: dialog renders newest-first; runbook executes oldest-first.
        .slice()
        .reverse()
        .map((r) => ({
          title: r.title.trim() || "Step",
          command: r.command,
          language: "bash",
        }));
      const result = await saveRunbook({
        name: name.trim(),
        description: description.trim() || null,
        steps: selected,
      });
      onSaved(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSave) {
      e.preventDefault();
      void save();
    }
  };

  return (
    <div className="picker-backdrop" role="presentation" onClick={onClose}>
      <div
        className="runbook"
        role="dialog"
        aria-label="Save selected blocks as runbook"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKey}
      >
        <div className="runbook-header">
          <div className="runbook-title">
            <span aria-hidden>💾</span>
            <span>Save as runbook</span>
          </div>
          <span className="runbook-desc">
            Pick the commands to include. Steps run top-to-bottom in the saved order (the dialog
            lists newest first; we reverse on save).
          </span>
        </div>
        <div className="save-form">
          <label className="save-field">
            <span>Name</span>
            <input
              ref={nameInputRef}
              type="text"
              className="picker-input"
              placeholder="e.g. Deploy staging"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="save-field">
            <span>Description (optional)</span>
            <input
              type="text"
              className="picker-input"
              placeholder="What does this runbook do?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
        </div>
        <div className="runbook-body">
          {rows.length === 0 ? (
            <div className="picker-empty">
              No completed blocks in this pane yet — run something first, then try again.
            </div>
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
                className={`runbook-step ${row.selected ? "" : "save-row-unchecked"}`}
              >
                <div className="runbook-step-head">
                  <input
                    type="checkbox"
                    checked={row.selected}
                    onChange={() => toggle(row.id)}
                    aria-label="Include this command"
                  />
                  <input
                    type="text"
                    className="save-title-input"
                    value={row.title}
                    onChange={(e) => setRowTitle(row.id, e.target.value)}
                    placeholder="Step title"
                  />
                  {row.exitCode !== null && row.exitCode !== 0 && (
                    <span className="save-exit-bad">exit {row.exitCode}</span>
                  )}
                </div>
                <pre className="runbook-step-cmd">{row.command}</pre>
              </div>
            ))
          )}
        </div>
        {error && <div className="save-error">{error}</div>}
        <div className="picker-footer">
          <span>
            {selectedCount} of {rows.length} step{rows.length === 1 ? "" : "s"} selected
          </span>
          <span className="picker-footer-spacer" />
          <button className="runbook-run" disabled={!canSave} onClick={() => void save()}>
            {saving ? "Saving…" : "Save runbook"}
          </button>
          <button className="si-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/** Synthesise a step title from the command — first ~40 chars of argv[0]
 * plus any subcommand. Users can edit it inline. */
function deriveTitle(command: string): string {
  const head = command.split("\n")[0].trim();
  if (head.length <= 40) return head;
  return head.slice(0, 39) + "…";
}
