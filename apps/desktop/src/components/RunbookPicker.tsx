import { useEffect, useRef, useState } from "react";
import { listRunbooks, runbooksDir, type RunbookSummary } from "../state/runbooks";
import "./runbook.css";

interface Props {
  onSelect: (summary: RunbookSummary) => void;
  onClose: () => void;
}

/** Modal listing runbooks discovered in the configured directory. */
export function RunbookPicker({ onSelect, onClose }: Props) {
  const [items, setItems] = useState<RunbookSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dir, setDir] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [filter, setFilter] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    runbooksDir().then(setDir);
    listRunbooks()
      .then(setItems)
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    setActiveIdx(0);
  }, [filter]);

  const filtered = items
    ? filter.trim()
      ? items.filter((r) => r.name.toLowerCase().includes(filter.trim().toLowerCase()))
      : items
    : [];

  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        onClose();
        return;
      case "ArrowDown":
        e.preventDefault();
        setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
        return;
      case "ArrowUp":
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 1));
        return;
      case "Enter": {
        e.preventDefault();
        const item = filtered[activeIdx];
        if (item) onSelect(item);
        return;
      }
    }
  };

  return (
    <div className="picker-backdrop" role="presentation" onClick={onClose}>
      <div
        className="picker"
        role="dialog"
        aria-label="Runbook picker"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKey}
      >
        <div className="picker-header">
          <span className="picker-cmd">Runbooks</span>
          <span className="picker-count" title={dir ?? ""}>
            {dir ? truncate(dir, 50) : ""}
          </span>
        </div>
        <input
          ref={inputRef}
          className="picker-input"
          type="text"
          placeholder="Filter…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="picker-list">
          {error ? (
            <div className="picker-empty">Error: {error}</div>
          ) : items === null ? (
            <div className="picker-empty">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="picker-empty">
              {items.length === 0 ? (
                <>
                  No runbooks found in <code>{dir ?? "(no dir)"}</code>.<br />
                  Drop a <code>.md</code> file with fenced shell blocks there.
                </>
              ) : (
                "No matching runbooks"
              )}
            </div>
          ) : (
            filtered.map((item, idx) => (
              <div
                key={item.path}
                className={`picker-row ${idx === activeIdx ? "picker-row-active" : ""}`}
                onPointerEnter={() => setActiveIdx(idx)}
                onClick={() => onSelect(item)}
              >
                <span className="picker-icon" aria-hidden>
                  📓
                </span>
                <div className="picker-labels">
                  <span className="picker-name">{item.name}</span>
                  {item.description && <span className="picker-sub">{item.description}</span>}
                </div>
                <span className="picker-meta">
                  {item.step_count} step{item.step_count === 1 ? "" : "s"}
                </span>
              </div>
            ))
          )}
        </div>
        <div className="picker-footer">
          <kbd>↑↓</kbd> select <kbd>Enter</kbd> open
          <span className="picker-footer-spacer" />
          <kbd>Esc</kbd> close
        </div>
      </div>
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : "…" + s.slice(s.length - (n - 1));
}
