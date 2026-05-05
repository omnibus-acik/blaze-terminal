import { useEffect, useState } from "react";
import { gitInfo, type GitInfo } from "../state/git";
import "./git-status-bar.css";

interface Props {
  /** Pane's working directory. `null` hides the bar entirely. */
  cwd: string | null;
  /** Bumped by the parent on output_end events to force a refresh — e.g.
   * after `git commit` / `git push` / file edits change the working tree. */
  refreshKey: number;
}

/**
 * Bottom-of-pane status bar. When the pane's cwd is inside a git repo we
 * show branch + upstream divergence + dirty counts; otherwise we just
 * surface the (shortened) cwd so the bar is still informative.
 */
export function GitStatusBar({ cwd, refreshKey }: Props) {
  const [info, setInfo] = useState<GitInfo | null>(null);
  const [loading, setLoading] = useState(false);

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
  return (
    <div className="git-status-bar" title={`${info.branch} · ${info.head_short}`}>
      <span className="git-branch">⎇ {info.branch || info.head_short}</span>
      {info.upstream && (info.ahead > 0 || info.behind > 0) && (
        <span className="git-divergence" title={`Upstream: ${info.upstream}`}>
          {info.ahead > 0 && <span className="git-ahead">↑{info.ahead}</span>}
          {info.behind > 0 && <span className="git-behind">↓{info.behind}</span>}
        </span>
      )}
      {dirty > 0 && (
        <span className="git-dirty" title={`${info.staged} staged · ${info.unstaged} unstaged`}>
          ●{dirty}
        </span>
      )}
      {info.untracked > 0 && (
        <span className="git-untracked" title={`${info.untracked} untracked file(s)`}>
          ?{info.untracked}
        </span>
      )}
      {info.stash > 0 && (
        <span className="git-stash" title={`${info.stash} stash entry(ies)`}>
          ✱{info.stash}
        </span>
      )}
      {info.conflicts > 0 && (
        <span className="git-conflicts" title={`${info.conflicts} file(s) with merge conflicts`}>
          ⚠{info.conflicts}
        </span>
      )}
      <span className="git-cwd">{short}</span>
    </div>
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
    // Keep first segment and last two; ellipsize the middle.
    const parts = display.split("/").filter(Boolean);
    if (parts.length > 4) {
      const first = display.startsWith("/") ? "/" + parts[0] : parts[0];
      const tail = parts.slice(-2).join("/");
      display = `${first}/…/${tail}`;
    }
  }
  return display;
}
