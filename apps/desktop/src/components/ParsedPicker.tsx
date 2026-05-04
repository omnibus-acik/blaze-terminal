import { useEffect, useRef, useState } from "react";
import { pickerItems, type ParsedBlock, type PickerAction, type PickerItem } from "../state/parsed";
import { smartActionFor, type ResolvedAction } from "../state/smartActions";
import { TRANSFER_MIME, type TransferPayload } from "../state/transfer";
import { getCwd } from "../state/cwdMap";
import "./parsed-picker.css";

export type { PickerAction };

/**
 * SmartActionInvoke is a special "action" emitted when the user holds Cmd/Ctrl
 * while activating a row. Terminal.tsx routes it directly into the PTY
 * without any further translation.
 */
export interface SmartActionInvoke {
  kind: "smart";
  resolved: ResolvedAction;
}

interface ParsedPickerProps {
  parsed: ParsedBlock;
  command: string;
  /** PTY session id this picker belongs to — used as the source paneId
   * when the user starts a drag from a row. */
  sourcePaneId: string;
  onAction: (action: PickerAction | SmartActionInvoke) => void;
  onClose: () => void;
}

const isMac = navigator.platform.toLowerCase().includes("mac");

export function ParsedPicker({
  parsed,
  command,
  sourcePaneId,
  onAction,
  onClose,
}: ParsedPickerProps) {
  const [filter, setFilter] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [modHeld, setModHeld] = useState(false);
  const [smartByPath, setSmartByPath] = useState<Record<string, ResolvedAction | null>>({});
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const allItems = pickerItems(parsed);
  const filtered = filterItems(allItems, filter);
  const activeItem = filtered[activeIdx];
  const activeSmart = activeItem?.path ? (smartByPath[activeItem.path] ?? null) : null;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setActiveIdx(0);
  }, [filter]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLDivElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  // Lazily resolve the smart action for the focused row's path. Cached so we
  // don't hit the Tauri command on every cursor move.
  useEffect(() => {
    const path = activeItem?.path;
    if (!path) return;
    if (path in smartByPath) return;
    let cancelled = false;
    smartActionFor(path).then((res) => {
      if (cancelled) return;
      setSmartByPath((prev) => ({ ...prev, [path]: res }));
    });
    return () => {
      cancelled = true;
    };
  }, [activeItem?.path, smartByPath]);

  // Track Cmd/Ctrl held state for the "alt action on activate" behaviour.
  // Capture-phase listener so we see the modifier even when the input has
  // focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const held = isMac ? e.metaKey : e.ctrlKey;
      setModHeld(held);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    window.addEventListener("keyup", onKey, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("keyup", onKey, { capture: true });
    };
  }, []);

  const fire = (item: PickerItem, useSmart: boolean) => {
    const smart = item.path ? (smartByPath[item.path] ?? null) : null;
    if (useSmart && smart) {
      onAction({ kind: "smart", resolved: smart });
    } else {
      onAction(item.defaultAction);
    }
    onClose();
  };

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
      case "n":
        if (e.ctrlKey) {
          e.preventDefault();
          setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
        }
        return;
      case "p":
        if (e.ctrlKey) {
          e.preventDefault();
          setActiveIdx((i) => Math.max(0, i - 1));
        }
        return;
      case "Home":
        e.preventDefault();
        setActiveIdx(0);
        return;
      case "End":
        e.preventDefault();
        setActiveIdx(Math.max(0, filtered.length - 1));
        return;
      case "Enter": {
        e.preventDefault();
        if (!activeItem) return;
        const useSmart = isMac ? e.metaKey : e.ctrlKey;
        fire(activeItem, useSmart);
        return;
      }
    }
  };

  const total = allItems.length;
  const truncated = parsed.truncated;
  const showSmartHint = modHeld && activeSmart !== null;

  return (
    <div className="picker-backdrop" onClick={onClose} role="presentation">
      <div
        className="picker"
        role="dialog"
        aria-label="Block actions"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKey}
      >
        <div className="picker-header">
          <span className="picker-cmd" title={command}>
            {truncate(command, 60)}
          </span>
          <span className="picker-count">
            {filtered.length} / {total}
            {truncated && <span className="picker-trunc"> · truncated</span>}
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
        <div className="picker-list" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="picker-empty">No matching entries</div>
          ) : (
            filtered.map((item, idx) => {
              const isActive = idx === activeIdx;
              const smart = item.path ? (smartByPath[item.path] ?? null) : null;
              return (
                <div
                  key={item.id}
                  data-idx={idx}
                  className={`picker-row ${isActive ? "picker-row-active" : ""}`}
                  draggable={item.path !== null}
                  onDragStart={(e) => {
                    if (!item.path) return;
                    const payload: TransferPayload = {
                      sourcePaneId,
                      sourceCwd: getCwd(sourcePaneId),
                      sourcePath: item.path,
                      label: item.label,
                      isDir: item.icon === "📁",
                    };
                    e.dataTransfer.effectAllowed = "copy";
                    e.dataTransfer.setData(TRANSFER_MIME, JSON.stringify(payload));
                    // Close the modal so the user can see and drop on
                    // panes underneath.
                    onClose();
                  }}
                  onPointerEnter={() => setActiveIdx(idx)}
                  onClick={(e) => fire(item, isMac ? e.metaKey : e.ctrlKey)}
                >
                  <span className="picker-icon" aria-hidden>
                    {item.icon}
                  </span>
                  <div className="picker-labels">
                    <span className="picker-name">{item.label}</span>
                    {item.sublabel && <span className="picker-sub">{item.sublabel}</span>}
                  </div>
                  {/* Smart hint replaces meta only on the active row; muted
                      by default, brightens when Cmd is held. Other rows keep
                      showing their normal meta (size, mode, git state). */}
                  {isActive && smart ? (
                    <span
                      className={`picker-smart-hint ${modHeld ? "picker-smart-hint-active" : ""}`}
                      title={smart.command}
                    >
                      {isMac ? "⌘" : "Ctrl"} → {truncate(smart.command, 36)}
                    </span>
                  ) : (
                    item.meta && <span className="picker-meta">{item.meta}</span>
                  )}
                </div>
              );
            })
          )}
        </div>
        <div className="picker-footer">
          {showSmartHint ? (
            <>
              <kbd>{isMac ? "⌘" : "Ctrl"}</kbd>+<kbd>Enter</kbd>{" "}
              {activeSmart?.label ?? "smart action"}
              <span className="picker-footer-spacer" />
              <kbd>↑↓</kbd> select <kbd>Esc</kbd> close
            </>
          ) : (
            <>
              <kbd>↑↓</kbd> select <kbd>Enter</kbd>{" "}
              {activeItem ? activeItem.defaultActionLabel : "—"}
              <span className="picker-footer-spacer" />
              {activeSmart ? (
                <span className="picker-hint-key">
                  hold <kbd>{isMac ? "⌘" : "Ctrl"}</kbd> for {activeSmart.label}
                </span>
              ) : null}
              <span className="picker-footer-spacer" />
              <kbd>Esc</kbd> close
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function filterItems(items: PickerItem[], filter: string): PickerItem[] {
  if (!filter.trim()) return items;
  const needle = filter.toLowerCase();
  return items.filter(
    (it) =>
      it.label.toLowerCase().includes(needle) || (it.sublabel ?? "").toLowerCase().includes(needle)
  );
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
