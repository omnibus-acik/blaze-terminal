import { useEffect, useState } from "react";
import { fetchStatus, install, type ShellStatus, type Shell } from "../state/shellIntegration";

const DISMISS_KEY = "blaze.si.banner-dismissed";

/**
 * One-time banner that prompts to install OSC 133 hooks for any shell with
 * an rcfile but no Blaze block. Click "Not now" persists across sessions.
 *
 * The dismissal applies ONLY to first-install ("not_installed"). When
 * Blaze ships an updated snippet (status flips to "outdated") we always
 * re-show, because the user already opted in once — they need to know
 * that features depending on the new hook (cwd tracking, capture
 * commands, etc.) won't work until they refresh.
 */
export function ShellIntegrationBanner() {
  const [statuses, setStatuses] = useState<ShellStatus[] | null>(null);
  const [dismissedNotInstalled, setDismissedNotInstalled] = useState(
    () => localStorage.getItem(DISMISS_KEY) === "1"
  );
  const [busy, setBusy] = useState<Shell | null>(null);

  useEffect(() => {
    fetchStatus()
      .then(setStatuses)
      .catch((e) => console.warn("shell_integration_status failed:", e));
  }, []);

  if (!statuses) return null;

  const outdated = statuses.filter((s) => s.status === "outdated");
  const notInstalled = statuses.filter((s) => s.status === "not_installed");

  // Show outdated regardless of prior dismissal — user already opted in.
  // Show not_installed only if the user hasn't already said "not now".
  const actionable = [...outdated, ...(dismissedNotInstalled ? [] : notInstalled)];
  if (actionable.length === 0) return null;

  const hasOutdated = outdated.length > 0;

  const dismiss = () => {
    // Only "not_installed" can be dismissed permanently — outdated keeps
    // re-appearing on each session until the user updates.
    if (!hasOutdated) {
      localStorage.setItem(DISMISS_KEY, "1");
      setDismissedNotInstalled(true);
    } else {
      // Hide for this session only.
      setStatuses((cur) =>
        (cur ?? []).map((s) => (s.status === "outdated" ? { ...s, status: "current" } : s))
      );
    }
  };

  const handleInstall = async (shell: Shell) => {
    setBusy(shell);
    try {
      const next = await install(shell);
      setStatuses((cur) => cur?.map((s) => (s.shell === shell ? next : s)) ?? null);
    } catch (e) {
      console.error("install failed:", e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="si-banner" role="dialog" aria-label="Shell integration">
      <div className="si-banner-text">
        <strong>
          {hasOutdated ? "Shell integration update available" : "Enable command blocks?"}
        </strong>
        <span className="si-banner-sub">
          {hasOutdated
            ? "Blaze's shell hooks have new features (cwd tracking for the git status bar, command capture, …). Click to refresh — the existing block in your rcfile is replaced in place."
            : "Blaze can add OSC 133 hooks to your shell rcfile so it can recognise where each command starts and ends. Reversible from Settings."}
        </span>
      </div>
      <div className="si-banner-actions">
        {actionable.map((s) => {
          const verb = s.status === "outdated" ? "Update" : "Install for";
          return (
            <button
              key={s.shell}
              className="si-btn si-btn-primary"
              disabled={busy !== null}
              onClick={() => handleInstall(s.shell)}
              title={`Modifies ${s.rcfile}`}
            >
              {busy === s.shell ? "Working…" : `${verb} ${s.shell}`}
            </button>
          );
        })}
        <button className="si-btn" onClick={dismiss}>
          {hasOutdated ? "Later" : "Not now"}
        </button>
      </div>
    </div>
  );
}
