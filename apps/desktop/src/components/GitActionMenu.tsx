import { useEffect, useRef, useState } from "react";
import { gitBranches, type BranchInfo, type GitInfo } from "../state/git";
import "./git-action-menu.css";

export type GitMenuSection = "sync" | "branch" | "tree";

interface Props {
  section: GitMenuSection;
  info: GitInfo;
  /** Caller writes the chosen command into the active pane's PTY. */
  onRun: (command: string) => void;
  onClose: () => void;
}

/**
 * Modal action menu for the git status bar. Sections:
 * - "sync"   — pull / push / sync / fetch
 * - "branch" — list local branches, switch with `git checkout`
 * - "tree"   — stage all / commit (with message) / discard all (typed-confirm)
 *
 * All ops fire as `git …` commands written to the active pane's PTY so the
 * user sees real output. Destructive ops (discard) require a typed
 * confirmation phrase.
 */
export function GitActionMenu({ section, info, onRun, onClose }: Props) {
  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  const fire = (cmd: string) => {
    onRun(cmd);
    onClose();
  };

  return (
    <div className="picker-backdrop git-menu-backdrop" role="presentation" onClick={onClose}>
      <div
        className="git-menu"
        role="dialog"
        aria-label="Git actions"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKey}
      >
        {section === "sync" && <SyncSection info={info} fire={fire} />}
        {section === "branch" && <BranchSection info={info} fire={fire} />}
        {section === "tree" && <TreeSection info={info} fire={fire} />}
      </div>
    </div>
  );
}

// ---- Sync section ----

function SyncSection({ info, fire }: { info: GitInfo; fire: (c: string) => void }) {
  const hasUpstream = !!info.upstream;
  return (
    <>
      <div className="git-menu-header">
        <span aria-hidden>🔄</span>
        <span>Sync</span>
        <span className="git-menu-spacer" />
        {info.upstream && <span className="git-menu-tag">{info.upstream}</span>}
      </div>
      <div className="git-menu-body">
        {!hasUpstream && (
          <div className="git-menu-warning">
            No upstream tracked. Set one with{" "}
            <code>git push -u origin {info.branch || info.head_short}</code>.
          </div>
        )}
        <ActionRow
          icon="↓"
          title="Pull"
          subtitle="git pull --ff-only"
          hint={info.behind > 0 ? `${info.behind} behind` : undefined}
          onClick={() => fire("git pull --ff-only")}
          disabled={!hasUpstream}
        />
        <ActionRow
          icon="↑"
          title="Push"
          subtitle="git push"
          hint={info.ahead > 0 ? `${info.ahead} ahead` : undefined}
          onClick={() => fire("git push")}
          disabled={!hasUpstream}
        />
        <ActionRow
          icon="⇅"
          title="Sync"
          subtitle="git pull --ff-only && git push"
          hint={info.ahead > 0 || info.behind > 0 ? `↑${info.ahead} ↓${info.behind}` : "in sync"}
          onClick={() => fire("git pull --ff-only && git push")}
          disabled={!hasUpstream}
        />
        <ActionRow
          icon="📡"
          title="Fetch"
          subtitle="git fetch --all --prune"
          onClick={() => fire("git fetch --all --prune")}
        />
      </div>
    </>
  );
}

// ---- Branch section ----

function BranchSection({ info, fire }: { info: GitInfo; fire: (c: string) => void }) {
  const [branches, setBranches] = useState<BranchInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [creating]);

  // Need cwd to fetch branches — passed via window event from parent.
  // To keep the component self-contained we read it from a hidden body
  // attribute that GitStatusBar writes before opening the menu.
  useEffect(() => {
    const cwd = document.body.dataset.gitMenuCwd;
    if (!cwd) {
      setError("no cwd");
      return;
    }
    gitBranches(cwd)
      .then(setBranches)
      .catch((e) => setError(String(e)));
  }, []);

  const filtered =
    branches && filter.trim()
      ? branches.filter((b) => b.name.toLowerCase().includes(filter.trim().toLowerCase()))
      : (branches ?? []);

  useEffect(() => {
    setActiveIdx(0);
  }, [filter]);

  const handleListKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (creating) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const b = filtered[activeIdx];
      if (b && !b.is_current) {
        fire(`git checkout ${shellQuote(b.name)}`);
      }
    }
  };

  const handleCreate = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setCreating(false);
      setFilter("");
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const name = filter.trim();
      if (!name) return;
      fire(`git checkout -b ${shellQuote(name)}`);
    }
  };

  return (
    <>
      <div className="git-menu-header">
        <span aria-hidden>⎇</span>
        <span>{creating ? "New branch" : "Switch branch"}</span>
        <span className="git-menu-spacer" />
        <span className="git-menu-tag">{info.branch || info.head_short}</span>
      </div>
      <div className="git-menu-body">
        <input
          ref={inputRef}
          className="picker-input"
          type="text"
          placeholder={creating ? "new-branch-name" : "Filter branches…"}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={creating ? handleCreate : handleListKey}
          autoComplete="off"
          spellCheck={false}
        />
        {!creating && (
          <>
            {error && <div className="git-menu-warning">{error}</div>}
            {!error && branches === null && <div className="git-menu-empty">Loading…</div>}
            {!error && branches !== null && filtered.length === 0 && (
              <div className="git-menu-empty">No matching branches</div>
            )}
            {filtered.map((b, idx) => (
              <div
                key={b.name}
                className={`git-menu-row ${idx === activeIdx ? "git-menu-row-active" : ""} ${
                  b.is_current ? "git-menu-row-current" : ""
                }`}
                onPointerEnter={() => setActiveIdx(idx)}
                onClick={() => {
                  if (!b.is_current) fire(`git checkout ${shellQuote(b.name)}`);
                }}
              >
                <span className="git-menu-row-icon">{b.is_current ? "●" : "○"}</span>
                <span className="git-menu-row-title">{b.name}</span>
                {b.upstream && <span className="git-menu-row-hint">→ {b.upstream}</span>}
                {b.is_current && <span className="git-menu-row-tag">current</span>}
              </div>
            ))}
            <div
              className="git-menu-row git-menu-row-action"
              onClick={() => {
                setCreating(true);
                setFilter("");
              }}
            >
              <span className="git-menu-row-icon">＋</span>
              <span className="git-menu-row-title">New branch from here…</span>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ---- Tree (working-copy) section ----

const DISCARD_PHRASE = "DISCARD";

function TreeSection({ info, fire }: { info: GitInfo; fire: (c: string) => void }) {
  const [commitMsg, setCommitMsg] = useState("");
  const [stageOnCommit, setStageOnCommit] = useState(true);
  const [discardTyped, setDiscardTyped] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const dirty = info.staged + info.unstaged + info.untracked;
  const canDiscard = discardTyped.trim() === DISCARD_PHRASE;

  return (
    <>
      <div className="git-menu-header">
        <span aria-hidden>📝</span>
        <span>Working tree</span>
        <span className="git-menu-spacer" />
        <span className="git-menu-tag">
          {info.staged + info.unstaged} dirty · {info.untracked} untracked
        </span>
      </div>
      <div className="git-menu-body">
        <ActionRow
          icon="👁"
          title="View diff"
          subtitle="git diff"
          hint={info.unstaged > 0 ? `${info.unstaged} unstaged` : undefined}
          onClick={() => fire("git diff")}
          disabled={info.unstaged === 0 && info.staged === 0}
        />
        <ActionRow
          icon="📂"
          title="View staged diff"
          subtitle="git diff --staged"
          hint={info.staged > 0 ? `${info.staged} staged` : undefined}
          onClick={() => fire("git diff --staged")}
          disabled={info.staged === 0}
        />
        <ActionRow
          icon="＋"
          title="Stage all"
          subtitle="git add -A"
          hint={`${info.unstaged + info.untracked} → staged`}
          onClick={() => fire("git add -A")}
          disabled={info.unstaged + info.untracked === 0}
        />
        <ActionRow
          icon="−"
          title="Unstage all"
          subtitle="git restore --staged ."
          hint={info.staged > 0 ? `${info.staged} staged` : undefined}
          onClick={() => fire("git restore --staged .")}
          disabled={info.staged === 0}
        />

        <div className="git-menu-section-label">Commit</div>
        <input
          className="picker-input"
          type="text"
          placeholder="Commit message"
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && commitMsg.trim() && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              const flag = stageOnCommit ? "-am" : "-m";
              fire(`git commit ${flag} ${shellQuote(commitMsg.trim())}`);
            }
          }}
        />
        <label className="git-menu-checkbox">
          <input
            type="checkbox"
            checked={stageOnCommit}
            onChange={(e) => setStageOnCommit(e.target.checked)}
          />
          <span>
            Stage all tracked changes first (<code>git commit -am</code>)
          </span>
        </label>
        <button
          className="runbook-run git-menu-cta"
          disabled={!commitMsg.trim() || dirty === 0}
          onClick={() => {
            const flag = stageOnCommit ? "-am" : "-m";
            fire(`git commit ${flag} ${shellQuote(commitMsg.trim())}`);
          }}
        >
          Commit
        </button>

        <div className="git-menu-section-label danger-label">Discard</div>
        {!discardOpen ? (
          <button
            className="git-menu-row git-menu-row-action git-menu-row-danger"
            onClick={() => setDiscardOpen(true)}
            disabled={dirty === 0}
          >
            <span className="git-menu-row-icon">⚠</span>
            <span className="git-menu-row-title">Discard all changes…</span>
            <span className="git-menu-row-hint">
              {info.staged + info.unstaged} tracked + {info.untracked} untracked
            </span>
          </button>
        ) : (
          <div className="git-menu-discard">
            <p>
              This will run <code>git restore .</code> and <code>git clean -fd</code>. Working tree
              changes <strong>cannot be recovered</strong>. Type <code>{DISCARD_PHRASE}</code> below
              to confirm.
            </p>
            <input
              className="picker-input"
              type="text"
              placeholder={DISCARD_PHRASE}
              value={discardTyped}
              onChange={(e) => setDiscardTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              autoFocus
            />
            <div className="git-menu-discard-actions">
              <button
                className="runbook-run git-menu-cta-danger"
                disabled={!canDiscard}
                onClick={() => fire("git restore . && git clean -fd")}
              >
                Discard
              </button>
              <button
                className="si-btn"
                onClick={() => {
                  setDiscardOpen(false);
                  setDiscardTyped("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ---- shared row component ----

function ActionRow({
  icon,
  title,
  subtitle,
  hint,
  onClick,
  disabled,
}: {
  icon: string;
  title: string;
  subtitle: string;
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className={`git-menu-row git-menu-row-action ${disabled ? "git-menu-row-disabled" : ""}`}
      onClick={onClick}
      disabled={disabled}
      type="button"
    >
      <span className="git-menu-row-icon">{icon}</span>
      <div className="git-menu-row-text">
        <span className="git-menu-row-title">{title}</span>
        <span className="git-menu-row-subtitle">{subtitle}</span>
      </div>
      {hint && <span className="git-menu-row-hint">{hint}</span>}
    </button>
  );
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
