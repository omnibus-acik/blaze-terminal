import "./terminal-header.css";

interface Props {
  cwd: string | null;
  canBack: boolean;
  canForward: boolean;
  onUp: () => void;
  onBack: () => void;
  onForward: () => void;
  onCopy: () => void;
  onPaste: () => void;
}

/**
 * File-explorer-style header rendered at the top of every pane.
 *
 * - Back / Forward walk the per-pane cwd history (built from OSC 7331
 *   cwd emits, so any `cd` typed by the user is captured).
 * - Up runs `cd ..` against the live shell.
 * - Copy copies the xterm selection if there is one, otherwise the cwd.
 * - Paste reads the system clipboard and feeds it through xterm's
 *   bracketed-paste path so multi-line text is handled correctly.
 *
 * The bar stays visible without a cwd (cwd is shown dim until shell
 * integration is installed) so the user can still copy/paste through it.
 */
export function TerminalHeader({
  cwd,
  canBack,
  canForward,
  onUp,
  onBack,
  onForward,
  onCopy,
  onPaste,
}: Props) {
  return (
    <div className="term-header" role="toolbar" aria-label="Terminal navigation">
      <button
        type="button"
        className="term-header-btn"
        onClick={onBack}
        disabled={!canBack}
        aria-label="Back"
        title="Back (previous folder)"
      >
        ←
      </button>
      <button
        type="button"
        className="term-header-btn"
        onClick={onForward}
        disabled={!canForward}
        aria-label="Forward"
        title="Forward (next folder)"
      >
        →
      </button>
      <button
        type="button"
        className="term-header-btn"
        onClick={onUp}
        disabled={!cwd || cwd === "/"}
        aria-label="Up one level"
        title="Up one folder (cd ..)"
      >
        ↑
      </button>
      <div className="term-header-path" title={cwd ?? "no cwd yet — install shell integration"}>
        {cwd ? shortPath(cwd) : <span className="term-header-path-empty">no cwd</span>}
      </div>
      <button
        type="button"
        className="term-header-btn"
        onClick={onCopy}
        aria-label="Copy"
        title="Copy selection (or current path if nothing is selected)"
      >
        ⧉
      </button>
      <button
        type="button"
        className="term-header-btn"
        onClick={onPaste}
        aria-label="Paste"
        title="Paste from clipboard"
      >
        ⤓
      </button>
    </div>
  );
}

/** Shrink the path so it fits on one line: ~ for home, ellipsize the
 *  middle if there are too many segments. Mirrors the GitStatusBar
 *  display logic so the two bars feel consistent. */
function shortPath(cwd: string): string {
  const homeMatch = cwd.match(/^(\/Users\/[^/]+|\/home\/[^/]+)/);
  let display = cwd;
  if (homeMatch) {
    display = "~" + cwd.slice(homeMatch[1].length);
  }
  if (display.length > 70) {
    const parts = display.split("/").filter(Boolean);
    if (parts.length > 4) {
      const first = display.startsWith("/") ? "/" + parts[0] : parts[0];
      const tail = parts.slice(-2).join("/");
      display = `${first}/…/${tail}`;
    }
  }
  return display;
}
