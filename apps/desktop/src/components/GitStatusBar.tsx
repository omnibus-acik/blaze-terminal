import { useEffect, useState } from "react";
import { gitInfo, type GitInfo } from "../state/git";
import { GitActionMenu, type GitMenuSection } from "./GitActionMenu";
import "./git-status-bar.css";

interface Props {
  /** Pane's working directory. `null` hides the bar entirely. */
  cwd: string | null;
  /** Bumped by the parent on output_end events to force a refresh — e.g.
   * after `git commit` / `git push` / file edits change the working tree. */
  refreshKey: number;
  /** Writes a shell command into the active pane's PTY (with trailing CR).
   * Required for the action menus that the bar opens on click. */
  onRunCommand: (command: string) => void;
}

/**
 * Bottom-of-pane status bar. When the pane's cwd is inside a git repo we
 * show branch + upstream divergence + dirty counts; otherwise we just
 * surface the (shortened) cwd so the bar is still informative.
 *
 * Each segment is also a button that opens an action menu:
 *   branch     → switch / create branch
 *   divergence → pull / push / sync / fetch
 *   dirty      → diff / stage / commit / discard
 */
export function GitStatusBar({ cwd, refreshKey, onRunCommand }: Props) {
  const [info, setInfo] = useState<GitInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [menu, setMenu] = useState<GitMenuSection | null>(null);

  useEffect(() => {
    if (!cwd) {
      setInfo(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    gitInfo(cwd)
      .then((i) => {
        if (cancelled) return;
        setInfo(i);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setInfo(null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, refreshKey]);

  if (!cwd) return null;

  const short = shortCwd(cwd);

  if (!info) {
    return (
      <div className="git-status-bar git-status-bar-no-repo" title={cwd}>
        <span className="git-no-repo-label">{loading ? "…" : "no repo"}</span>
        <span className="git-cwd">{short}</span>
      </div>
    );
  }

  const dirty = info.staged + info.unstaged;

  const openMenu = (section: GitMenuSection) => {
    document.body.dataset.gitMenuCwd = cwd;
    setMenu(section);
  };

  return (
    <>
      <div className="git-status-bar" title={`${info.branch} · ${info.head_short}`}>
        <button
          type="button"
          className="git-segment git-branch"
          onClick={() => openMenu("branch")}
          title="Click to switch or create branch"
        >
          ⎇ {info.branch || info.head_short}
        </button>
        {info.upstream ? (
          info.ahead > 0 || info.behind > 0 ? (
            <button
              type="button"
              className="git-segment git-divergence"
              onClick={() => openMenu("sync")}
              title={`Sync with ${info.upstream}`}
            >
              {info.ahead > 0 && <span className="git-ahead">↑{info.ahead}</span>}
              {info.behind > 0 && <span className="git-behind">↓{info.behind}</span>}
            </button>
          ) : (
            <button
              type="button"
              className="git-segment git-segment-quiet git-in-sync"
              onClick={() => openMenu("sync")}
              title={`In sync with ${info.upstream}`}
            >
              ✓ sync
            </button>
          )
        ) : (
          <button
            type="button"
            className="git-segment git-segment-quiet git-no-upstream"
            onClick={() => openMenu("sync")}
            title="No upstream tracked"
          >
            ⊘ no upstream
          </button>
        )}
        {dirty > 0 ? (
          <button
            type="button"
            className="git-segment git-dirty"
            onClick={() => openMenu("tree")}
            title={`${info.staged} staged · ${info.unstaged} unstaged`}
          >
            ●{dirty}
          </button>
        ) : info.untracked === 0 ? (
          <button
            type="button"
            className="git-segment git-segment-quiet"
            onClick={() => openMenu("tree")}
            title="Working tree clean"
          >
            ✓ clean
          </button>
        ) : null}
        {info.untracked > 0 && (
          <button
            type="button"
            className="git-segment git-untracked"
            onClick={() => openMenu("tree")}
            title={`${info.untracked} untracked file(s)`}
          >
            ?{info.untracked}
          </button>
        )}
        {info.stash > 0 && (
          <span className="git-stash" title={`${info.stash} stash entry(ies)`}>
            ✱{info.stash}
          </span>
        )}
        {info.conflicts > 0 && (
          <button
            type="button"
            className="git-segment git-conflicts"
            onClick={() => openMenu("tree")}
            title={`${info.conflicts} file(s) with merge conflicts`}
          >
            ⚠{info.conflicts}
          </button>
        )}
        <span className="git-cwd">{short}</span>
      </div>
      {menu && (
        <GitActionMenu
          section={menu}
          info={info}
          onRun={onRunCommand}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  );
}

/** Replace the user's home directory with `~`. Truncate the middle if the
 * remaining path is too long for the bar. */
function shortCwd(cwd: string): string {
  const homeMatch = cwd.match(/^(\/Users\/[^/]+|\/home\/[^/]+)/);
  let display = cwd;
  if (homeMatch) {
    display = "~" + cwd.slice(homeMatch[1].length);
  }
  if (display.length > 60) {
    const parts = display.split("/").filter(Boolean);
    if (parts.length > 4) {
      const first = display.startsWith("/") ? "/" + parts[0] : parts[0];
      const tail = parts.slice(-2).join("/");
      display = `${first}/…/${tail}`;
    }
  }
  return display;
}
