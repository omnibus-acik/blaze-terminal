import { useEffect, useRef, useState } from "react";
import { sshHosts, sshSubtitle, type SshHost } from "../state/ssh";

interface Props {
  /** Fired when the user picks a host. The caller is responsible for
   *  spawning a tab and running `ssh <name>`. */
  onConnect: (host: SshHost) => void;
  onClose: () => void;
}

/**
 * Modal that lists every connectable host parsed from `~/.ssh/config`.
 *
 * Mirrors the runbook picker's UX (filter input, ↑/↓ to navigate, Enter
 * to confirm, Esc to close) so users only have to learn one keymap. The
 * filter matches against the alias, hostname, and user fields so users
 * can find a host by its IP or login as well as its label.
 */
export function SshHostsPicker({ onConnect, onClose }: Props) {
  const [items, setItems] = useState<SshHost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [filter, setFilter] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    sshHosts()
      .then(setItems)
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    setActiveIdx(0);
  }, [filter]);

  const term = filter.trim().toLowerCase();
  const filtered =
    items === null
      ? []
      : term === ""
        ? items
        : items.filter((h) =>
            [h.name, h.hostname ?? "", h.user ?? ""].some((f) => f.toLowerCase().includes(term))
          );

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
        if (item) onConnect(item);
        return;
      }
    }
  };

  return (
    <div className="picker-backdrop" role="presentation" onClick={onClose}>
      <div
        className="picker"
        role="dialog"
        aria-label="SSH host picker"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKey}
      >
        <div className="picker-header">
          <span className="picker-cmd">SSH hosts</span>
          <span className="picker-count">
            {items === null ? "" : `${filtered.length} of ${items.length}`}
          </span>
        </div>
        <input
          ref={inputRef}
          className="picker-input"
          type="text"
          placeholder="Filter by alias, hostname, or user…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="picker-list">
          {error ? (
            <div className="picker-empty">Error: {error}</div>
          ) : items === null ? (
            <div className="picker-empty">Loading…</div>
          ) : items.length === 0 ? (
            <div className="picker-empty">
              No hosts found in <code>~/.ssh/config</code>. Add a <code>Host</code> entry there to
              make it appear here.
            </div>
          ) : filtered.length === 0 ? (
            <div className="picker-empty">No matching hosts</div>
          ) : (
            filtered.map((host, idx) => (
              <div
                key={`${host.source}::${host.name}`}
                className={`picker-row ${idx === activeIdx ? "picker-row-active" : ""}`}
                onPointerEnter={() => setActiveIdx(idx)}
                onClick={() => onConnect(host)}
              >
                <span className="picker-icon" aria-hidden>
                  🖥
                </span>
                <div className="picker-labels">
                  <span className="picker-name">{host.name}</span>
                  <span className="picker-sub">{sshSubtitle(host)}</span>
                </div>
                {host.identity_file && (
                  <span className="picker-meta" title={`Identity: ${host.identity_file}`}>
                    🔑
                  </span>
                )}
              </div>
            ))
          )}
        </div>
        <div className="picker-footer">
          <kbd>↑↓</kbd> select <kbd>Enter</kbd> connect
          <span className="picker-footer-spacer" />
          <kbd>Esc</kbd> close
        </div>
      </div>
    </div>
  );
}
