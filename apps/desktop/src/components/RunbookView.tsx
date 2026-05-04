import { useEffect, useMemo, useRef, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { loadRunbook, type Runbook, type RunbookSummary } from "../state/runbooks";
import {
  extractVariables,
  preloadSecrets,
  substituteVariables,
  type Variable,
} from "../state/variables";
import { Terminal } from "../Terminal";
import { VariablePrompt } from "./VariablePrompt";
import "./runbook.css";

interface Props {
  summary: RunbookSummary;
  onClose: () => void;
}

const SHELL_LANGS = new Set(["bash", "sh", "zsh", "fish", "ksh", ""]);

type RunState =
  | { kind: "pending" }
  | { kind: "running"; startedAt: number; condId: string | null }
  | { kind: "ok"; startedAt: number; endedAt: number; exitCode: number | null }
  | { kind: "failed"; startedAt: number; endedAt: number; exitCode: number | null }
  | { kind: "skipped"; startedAt: number; endedAt: number };

type BlockEvent =
  | { kind: "prompt_start" }
  | { kind: "command_start" }
  | { kind: "output_start" }
  | { kind: "output_end"; exit_code: number | null }
  | { kind: "captured_command"; text: string }
  | { kind: "condition_ok"; id: string }
  | { kind: "condition_skip"; id: string };

/**
 * Split-view runbook workspace.
 *
 * Layout: tab-content area is replaced by:
 *   ┌─────────────┬───────────────────────────────┐
 *   │ Step list   │ Dedicated Terminal (own PTY)  │
 *   │  • status   │                               │
 *   │  • Run btn  │  step output streams here     │
 *   └─────────────┴───────────────────────────────┘
 *
 * The PTY is spawned on mount (via the Terminal child) and killed on close,
 * so each opening of a runbook gets a clean shell.
 */
export function RunbookView({ summary, onClose }: Props) {
  const sessionId = useMemo(() => `runbook-${crypto.randomUUID()}`, []);
  const [book, setBook] = useState<Runbook | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [runStates, setRunStates] = useState<Record<number, RunState>>({});
  const [varCache, setVarCache] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<{ idx: number; vars: Variable[]; command: string } | null>(
    null
  );
  const runningQueueRef = useRef<number[]>([]);
  const tickRef = useRef<number>(0);
  const runAllRef = useRef<{ active: boolean; nextIdx: number } | null>(null);
  // Conditional-step bookkeeping. When a step has `if=`/`unless=`, its run
  // state stays in `running` until either a `condition_skip` arrives (→
  // skipped) or `condition_ok` arrives (→ keep running, output_end will
  // finalize). condResultsRef records skip results in case the events
  // arrive out of order with output_end.
  const condIdToStepRef = useRef<Map<string, number>>(new Map());
  const condCounterRef = useRef<number>(0);
  const skippedStepsRef = useRef<Set<number>>(new Set());
  const [runAllActive, setRunAllActive] = useState(false);
  const [, forceTick] = useState(0);
  const stepListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadRunbook(summary.path)
      .then(setBook)
      .catch((e) => setError(String(e)));
  }, [summary.path]);

  // Pre-resolve all secrets from the keychain once the runbook has loaded.
  useEffect(() => {
    if (!book) return;
    const allVars = book.steps.flatMap((s) => extractVariables(s.command));
    if (allVars.length === 0) return;
    let cancelled = false;
    preloadSecrets(allVars).then((fromKeychain) => {
      if (cancelled) return;
      if (Object.keys(fromKeychain).length === 0) return;
      setVarCache((prev) => ({ ...fromKeychain, ...prev }));
    });
    return () => {
      cancelled = true;
    };
  }, [book]);

  // Subscribe to OUR PTY's block stream — drives per-step status updates
  // and Run-all auto-advance.
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    (async () => {
      unlisten = await listen<BlockEvent>(`pty:${sessionId}:block`, (event) => {
        if (event.payload.kind === "condition_skip") {
          // Mark the step as skipped now; output_end will still fire for
          // the wrapping shell construct but we'll treat it as a no-op.
          const stepIdx = condIdToStepRef.current.get(event.payload.id);
          if (stepIdx === undefined) return;
          skippedStepsRef.current.add(stepIdx);
          condIdToStepRef.current.delete(event.payload.id);
          const now = Date.now();
          setRunStates((prev) => {
            const cur = prev[stepIdx];
            if (!cur || cur.kind !== "running") return prev;
            return {
              ...prev,
              [stepIdx]: { kind: "skipped", startedAt: cur.startedAt, endedAt: now },
            };
          });
          return;
        }
        if (event.payload.kind === "condition_ok") {
          // The step's command will run as part of the same wrapping
          // shell construct; nothing more to do here.
          condIdToStepRef.current.delete(event.payload.id);
          return;
        }
        if (event.payload.kind !== "output_end") return;
        const exitCode = event.payload.exit_code;
        const stepIdx = runningQueueRef.current.shift();
        if (stepIdx === undefined) return;
        // If the wrapping construct skipped, the step is already in
        // "skipped" state — don't overwrite, but do drive Run-all forward.
        if (skippedStepsRef.current.has(stepIdx)) {
          skippedStepsRef.current.delete(stepIdx);
          const ra = runAllRef.current;
          if (ra?.active) {
            setActiveIdx(ra.nextIdx);
            queueMicrotask(() => advanceRunAll());
          }
          return;
        }
        const now = Date.now();
        const success = exitCode === null || exitCode === 0;
        setRunStates((prev) => {
          const cur = prev[stepIdx];
          if (!cur || cur.kind !== "running") return prev;
          return {
            ...prev,
            [stepIdx]: {
              kind: success ? "ok" : "failed",
              startedAt: cur.startedAt,
              endedAt: now,
              exitCode,
            },
          };
        });
        const ra = runAllRef.current;
        if (ra?.active) {
          if (!success) {
            stopRunAll();
          } else {
            setActiveIdx(ra.nextIdx);
            queueMicrotask(() => advanceRunAll());
          }
        }
      });
    })();
    return () => {
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Live duration tick.
  useEffect(() => {
    const anyRunning = Object.values(runStates).some((s) => s.kind === "running");
    if (!anyRunning) return;
    const id = window.setInterval(() => {
      tickRef.current += 1;
      forceTick((n) => n + 1);
    }, 250);
    return () => window.clearInterval(id);
  }, [runStates]);

  // Keep active step in view.
  useEffect(() => {
    const el = stepListRef.current?.querySelector<HTMLDivElement>(`[data-step="${activeIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  const fireStep = (idx: number, command: string) => {
    const step = book?.steps[idx];
    let toSend = command.trimEnd();
    let condId: string | null = null;
    if (step?.condition) {
      // Wrap the command so the shell evaluates the condition, emits an
      // OSC 7331;cond marker telling us which branch was taken, and only
      // runs the actual step on the "true" branch. Variables in the
      // condition itself get the same {{var}} substitution as the body.
      const substitutedCond = substituteVariables(step.condition, varCache);
      condId = `step-${idx}-${++condCounterRef.current}`;
      condIdToStepRef.current.set(condId, idx);
      toSend = wrapWithCondition({
        condId,
        condition: substitutedCond,
        negate: step.negate,
        body: command.trimEnd(),
      });
    }
    invoke("pty_write", { id: sessionId, data: toSend + "\r" }).catch((err) =>
      console.error("pty_write failed:", err)
    );
    runningQueueRef.current.push(idx);
    setRunStates((prev) => ({
      ...prev,
      [idx]: { kind: "running", startedAt: Date.now(), condId },
    }));
  };

  const tryRunStep = (idx: number) => {
    const step = book?.steps[idx];
    if (!step) return;
    if (!SHELL_LANGS.has(step.language.toLowerCase())) return;
    const vars = extractVariables(step.command);
    const allCached = vars.every((v) => varCache[v.name]?.length > 0);
    if (vars.length === 0 || allCached) {
      const finalCmd = substituteVariables(step.command, varCache);
      fireStep(idx, finalCmd);
    } else {
      setPending({ idx, vars, command: step.command });
    }
  };

  const advanceRunAll = () => {
    const ra = runAllRef.current;
    if (!ra?.active || !book) return;
    let i = ra.nextIdx;
    while (i < book.steps.length) {
      const step = book.steps[i];
      if (!SHELL_LANGS.has(step.language.toLowerCase())) {
        i += 1;
        continue;
      }
      const prevState = runStates[i]?.kind;
      if (prevState === "ok" || prevState === "skipped") {
        i += 1;
        continue;
      }
      if (step.mode === "manual") {
        stopRunAll();
        setActiveIdx(i);
        return;
      }
      const vars = extractVariables(step.command);
      const allCached = vars.every((v) => varCache[v.name]?.length > 0);
      if (vars.length > 0 && !allCached) {
        stopRunAll();
        setActiveIdx(i);
        setPending({ idx: i, vars, command: step.command });
        return;
      }
      runAllRef.current = { active: true, nextIdx: i + 1 };
      setActiveIdx(i);
      const finalCmd = substituteVariables(step.command, varCache);
      fireStep(i, finalCmd);
      return;
    }
    stopRunAll();
  };

  const startRunAll = () => {
    if (!book || book.steps.length === 0) return;
    runAllRef.current = { active: true, nextIdx: 0 };
    setRunAllActive(true);
    advanceRunAll();
  };

  const stopRunAll = () => {
    runAllRef.current = null;
    setRunAllActive(false);
  };

  const onPromptSubmit = (values: Record<string, string>) => {
    if (!pending) return;
    const merged = { ...varCache, ...values };
    setVarCache(merged);
    const finalCmd = substituteVariables(pending.command, merged);
    fireStep(pending.idx, finalCmd);
    setPending(null);
  };

  // Cmd/Ctrl+Shift+R inside the view also closes it (for symmetry with the
  // open shortcut).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) {
        // Don't trap Esc — it's used by xterm and the picker. Only react
        // when focus is on us. Identifying "on us" is fragile; we just
        // ignore Esc here and rely on the close button.
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending]);

  return (
    <div className="rbview" role="region" aria-label={`Runbook: ${summary.name}`}>
      <div className="rbview-header">
        <div className="rbview-title">
          <span aria-hidden>📓</span>
          <span>{summary.name}</span>
          {(book?.description || summary.description) && (
            <span className="rbview-desc">{book?.description ?? summary.description}</span>
          )}
        </div>
        <div className="rbview-header-actions">
          {book && book.steps.length > 0 && (
            <button
              className={`runbook-run runbook-run-all ${runAllActive ? "running" : ""}`}
              onClick={() => (runAllActive ? stopRunAll() : startRunAll())}
            >
              {runAllActive ? "Stop" : "Run all"}
            </button>
          )}
          <button className="si-btn" onClick={onClose} title="Close runbook (return to panes)">
            Close ✕
          </button>
        </div>
      </div>
      <div className="rbview-body">
        <div className="rbview-steps" ref={stepListRef}>
          {error ? (
            <div className="picker-empty">Error: {error}</div>
          ) : book === null ? (
            <div className="picker-empty">Loading…</div>
          ) : book.steps.length === 0 ? (
            <div className="picker-empty">No steps in this runbook</div>
          ) : (
            book.steps.map((step, idx) => {
              const isShell = SHELL_LANGS.has(step.language.toLowerCase());
              const isActive = idx === activeIdx;
              const state = runStates[idx] ?? { kind: "pending" };
              const stepVars = extractVariables(step.command);
              return (
                <div
                  key={idx}
                  data-step={idx}
                  className={`runbook-step ${isActive ? "runbook-step-active" : ""}`}
                  onPointerEnter={() => setActiveIdx(idx)}
                >
                  <div className="runbook-step-head">
                    <StatusPill state={state} index={idx} />
                    <span className="runbook-step-title">{step.title}</span>
                    <span className="runbook-step-lang">{step.language || "shell"}</span>
                    {step.mode === "manual" && (
                      <span
                        className="runbook-step-manual"
                        title="Manual step — Run-all pauses here"
                      >
                        manual
                      </span>
                    )}
                    {step.condition && (
                      <span
                        className="runbook-step-cond"
                        title={`${step.negate ? "unless" : "if"}: ${step.condition}`}
                      >
                        {step.negate ? "unless" : "if"}
                      </span>
                    )}
                    {stepVars.length > 0 && (
                      <span
                        className="runbook-step-vars"
                        title={stepVars.map((v) => v.name).join(", ")}
                      >
                        {stepVars.length} var{stepVars.length === 1 ? "" : "s"}
                      </span>
                    )}
                    <DurationLabel state={state} />
                    <button
                      className="runbook-run"
                      disabled={!isShell || state.kind === "running"}
                      onClick={() => tryRunStep(idx)}
                    >
                      {state.kind === "running"
                        ? "…"
                        : state.kind === "ok" || state.kind === "failed"
                          ? "Re-run"
                          : "Run"}
                    </button>
                  </div>
                  <pre className="runbook-step-cmd">{step.command}</pre>
                </div>
              );
            })
          )}
        </div>
        <div className="rbview-pane">
          <Terminal sessionId={sessionId} active={true} />
        </div>
      </div>
      {pending && book && (
        <VariablePrompt
          stepTitle={book.steps[pending.idx]?.title ?? "Step"}
          variables={pending.vars}
          initial={varCache}
          onSubmit={onPromptSubmit}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}

function StatusPill({ state, index }: { state: RunState; index: number }) {
  switch (state.kind) {
    case "pending":
      return (
        <span className="runbook-step-status" aria-label="Pending">
          {index + 1}
        </span>
      );
    case "running":
      return (
        <span className="runbook-step-status running" aria-label="Running" role="status">
          ⋯
        </span>
      );
    case "ok":
      return (
        <span className="runbook-step-status ran" aria-label="Succeeded">
          ✓
        </span>
      );
    case "failed":
      return (
        <span
          className="runbook-step-status failed"
          aria-label={`Failed (exit ${state.exitCode ?? "?"})`}
          title={`exit ${state.exitCode ?? "?"}`}
        >
          ✗
        </span>
      );
    case "skipped":
      return (
        <span
          className="runbook-step-status skipped"
          aria-label="Skipped (condition was false)"
          title="Skipped — condition was false"
        >
          ⊘
        </span>
      );
  }
}

function DurationLabel({ state }: { state: RunState }) {
  if (state.kind === "pending") return null;
  const start = state.startedAt;
  const end = state.kind === "running" ? Date.now() : state.endedAt;
  const ms = Math.max(0, end - start);
  return <span className="runbook-step-duration">{formatDuration(ms)}</span>;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.floor(s % 60);
  return `${m}m${rem.toString().padStart(2, "0")}s`;
}

/**
 * Build the shell construct that runs the step iff its condition holds.
 * Sent as a single multi-line input to the runbook's PTY (which evaluates
 * it as one bash command from prompt to fi).
 *
 * The OSC 7331;cond markers are invisible in scrollback (escape sequences
 * are not rendered as glyphs); the explicit `[blaze: …]` traces give the
 * user a visible record of what happened.
 */
function wrapWithCondition({
  condId,
  condition,
  negate,
  body,
}: {
  condId: string;
  condition: string;
  negate: boolean;
  body: string;
}): string {
  // Escape backslashes and single quotes so we can put the condition's
  // human-readable form inside a single-quoted printf for the trace line.
  const visibleCond = (negate ? "unless: " : "if: ") + condition;
  const traceVisible = visibleCond.replace(/\\/g, "\\\\").replace(/'/g, String.raw`'\''`);
  const head = negate ? `if ! { ${condition}; }; then` : `if ${condition}; then`;
  // Explicit trace line BEFORE the markers so the user sees what's happening
  // even if anything goes wrong with the OSC roundtrip.
  return [
    `printf '\\033[2m[blaze] checking ${traceVisible}\\033[0m\\n'`,
    head,
    `  printf '\\033]7331;cond;${condId}:ok\\007'`,
    `  printf '\\033[2m[blaze] condition true — running step\\033[0m\\n'`,
    body,
    `else`,
    `  printf '\\033]7331;cond;${condId}:skip\\007'`,
    `  printf '\\033[2m[blaze] condition false — step skipped\\033[0m\\n'`,
    `fi`,
  ].join("\n");
}
