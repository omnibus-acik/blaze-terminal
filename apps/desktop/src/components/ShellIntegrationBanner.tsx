import { useEffect, useState } from "react";
import { fetchStatus, install, type ShellStatus, type Shell } from "../state/shellIntegration";

const DISMISS_KEY = "blaze.si.banner-dismissed";

// One-time banner: prompts to install OSC 133 hooks for any shell that
// has an rcfile but isn't yet integrated. Dismiss persists in localStorage
// (per spec §5.3 — install requires explicit consent and is reversible
// from Settings later).
export function ShellIntegrationBanner() {
  const [statuses, setStatuses] = useState<ShellStatus[] | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === "1");
  const [busy, setBusy] = useState<Shell | null>(null);

  useEffect(() => {
    if (dismissed) return;
    fetchStatus()
      .then(setStatuses)
      .catch((e) => console.warn("shell_integration_status failed:", e));
  }, [dismissed]);

  if (dismissed || !statuses) return null;

  const actionable = statuses.filter(
    (s) => s.status === "not_installed" || s.status === "outdated"
  );
  if (actionable.length === 0) return null;

  const hasOutdated = actionable.some((s) => s.status === "outdated");

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
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
            ? "Blaze's shell hooks have been updated (better command capture). Click to refresh."
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
          Not now
        </button>
      </div>
    </div>
  );
}
