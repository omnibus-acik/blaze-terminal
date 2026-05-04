// Per-pane command-block model. Tracks OSC 133 markers reported by the Rust
// PTY layer and exposes helpers to read each block's command + output text
// back out of xterm's buffer.

import type { IDecoration, IMarker, Terminal as XTerm } from "@xterm/xterm";
import type { ParsedBlock } from "./state/parsed";

export type BlockEvent =
  | { kind: "prompt_start" }
  | { kind: "command_start" }
  | { kind: "output_start" }
  | { kind: "output_end"; exit_code: number | null }
  | { kind: "captured_command"; text: string };

export interface TrackedBlock {
  /** Marker registered at OSC 133;A — the line the prompt will start on. */
  promptMarker: IMarker;
  /** Buffer line index where command output begins (set on output_start). */
  outputStartLine: number | null;
  /** Buffer line index *just past* the last line of output (set on output_end). */
  outputEndLine: number | null;
  /** Exit code reported by OSC 133;D, if any. */
  exitCode: number | null;
  /** Exact command text from OSC 7331;cmd, if shell integration emitted one. */
  capturedCommand: string | null;
  /** Structured parser output (only set for blocks whose command we recognise). */
  parsed: ParsedBlock | null;
  state: "running" | "done";
  /** Left-margin colored bar; recreated on state change. */
  decoration: IDecoration | null;
}

export const RUNNING_COLOR = "#3b82f6";
export const SUCCESS_COLOR = "#10b981";
export const FAILURE_COLOR = "#ef4444";

const BLOCK_DECORATION_CLASS = "blaze-block-marker";

const cursorAbsLine = (term: XTerm): number => {
  const buf = term.buffer.active;
  return buf.baseY + buf.cursorY;
};

const renderMarker = (decoration: IDecoration, label: string) => {
  decoration.onRender((el) => {
    el.classList.add(BLOCK_DECORATION_CLASS);
    el.title = label;
  });
};

const colorFor = (state: "running" | "done", exitCode: number | null): string => {
  if (state === "running") return RUNNING_COLOR;
  return exitCode === null || exitCode === 0 ? SUCCESS_COLOR : FAILURE_COLOR;
};

export function applyBlockEvent(term: XTerm, blocks: TrackedBlock[], event: BlockEvent): void {
  switch (event.kind) {
    case "prompt_start": {
      const marker = term.registerMarker(0);
      if (!marker) return;
      const decoration =
        (term.registerDecoration({
          marker,
          width: 1,
          x: 0,
          layer: "top",
          backgroundColor: RUNNING_COLOR,
        }) as IDecoration | null) ?? null;
      if (decoration) renderMarker(decoration, "Block (running)");
      blocks.push({
        promptMarker: marker,
        outputStartLine: null,
        outputEndLine: null,
        exitCode: null,
        capturedCommand: null,
        parsed: null,
        state: "running",
        decoration,
      });
      break;
    }
    case "captured_command": {
      // Fires *just before* output_start (preexec). Attach to the still-
      // running block.
      const last = lastRunning(blocks);
      if (!last) return;
      last.capturedCommand = event.text;
      break;
    }
    case "output_start": {
      const last = lastRunning(blocks);
      if (!last) return;
      last.outputStartLine = cursorAbsLine(term);
      break;
    }
    case "output_end": {
      const last = lastRunning(blocks);
      if (!last) return;
      last.state = "done";
      last.exitCode = event.exit_code;
      last.outputEndLine = cursorAbsLine(term);

      const color = colorFor("done", event.exit_code);
      last.decoration?.dispose();
      const decoration =
        (term.registerDecoration({
          marker: last.promptMarker,
          width: 1,
          x: 0,
          layer: "top",
          backgroundColor: color,
        }) as IDecoration | null) ?? null;
      if (decoration) renderMarker(decoration, `Block (exit ${event.exit_code ?? "?"})`);
      last.decoration = decoration;
      break;
    }
    case "command_start":
      // Reserved for finer-grained UI in P3c.
      break;
  }
}

const lastRunning = (blocks: TrackedBlock[]): TrackedBlock | null => {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].state === "running") return blocks[i];
  }
  return null;
};

export const lastDoneBlock = (blocks: TrackedBlock[]): TrackedBlock | null => {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].state === "done") return blocks[i];
  }
  return null;
};

/** Snapshot of a completed block as a runbook step candidate. */
export interface BlockSnapshot {
  index: number;
  command: string;
  exitCode: number | null;
}

/** Walk the block list newest-first and return up to `limit` completed
 * blocks that have a usable command (captured or readable from buffer). */
export function recentBlockSnapshots(
  term: XTerm,
  blocks: TrackedBlock[],
  limit: number
): BlockSnapshot[] {
  const out: BlockSnapshot[] = [];
  for (let i = blocks.length - 1; i >= 0 && out.length < limit; i--) {
    const b = blocks[i];
    if (b.state !== "done") continue;
    const command = b.capturedCommand ?? stripPromptPrefix(readBlockCommandLine(term, b));
    if (!command.trim()) continue;
    out.push({ index: i, command: command.trim(), exitCode: b.exitCode });
  }
  return out;
}

/** Attach a parsed result to the most recently active block (the one whose
 * output just ended). We accept either state because the `parsed` and the
 * `block(OutputEnd)` events arrive on different Tauri channels — ordering
 * across channels isn't guaranteed, so the block may still be `running`
 * when the parsed event lands. Returns the block we attached to. */
export function attachParsedToLastActive(
  blocks: TrackedBlock[],
  parsed: ParsedBlock
): TrackedBlock | null {
  if (blocks.length === 0) return null;
  const target = blocks[blocks.length - 1];
  target.parsed = parsed;
  return target;
}

/**
 * Best-effort prompt-line text extraction.
 *
 * The shell snippet emits OSC 133;C from `preexec`, which fires after the
 * user's Enter has echoed a newline. So at output_start the cursor sits one
 * line below the line containing both the prompt and the typed command.
 *
 * We read that line as a single string. It includes the prompt characters
 * (`%`, `❯`, `$`, …) which is fine for "copy command" — paste includes the
 * prompt as a visible reminder of context. Stripping the prompt cleanly
 * needs OSC 7331 command capture (P3c).
 */
export function readBlockCommandLine(term: XTerm, block: TrackedBlock): string {
  if (block.outputStartLine === null) return "";
  const lineIdx = block.outputStartLine - 1;
  if (lineIdx < 0) return "";
  const buf = term.buffer.active;
  const line = buf.getLine(lineIdx);
  return line ? line.translateToString(true).trimEnd() : "";
}

/** Strip a likely shell prompt prefix from a captured prompt+command line. */
export function stripPromptPrefix(promptAndCmd: string): string {
  // Look for the last occurrence of a common prompt-ending glyph followed by a
  // space, and take everything after it. Falls back to the whole string.
  const m = promptAndCmd.match(/(?:[%$#>❯]|»)\s+(.+)$/);
  return m ? m[1] : promptAndCmd.trim();
}

/**
 * Return the best-known command text for a block. Prefers OSC 7331 capture
 * (always exact); falls back to the prompt-stripping heuristic if shell
 * integration isn't installed or didn't emit one.
 */
export function commandFor(term: XTerm, block: TrackedBlock): string {
  if (block.capturedCommand !== null) return block.capturedCommand;
  return stripPromptPrefix(readBlockCommandLine(term, block));
}

export function readBlockOutput(term: XTerm, block: TrackedBlock): string {
  if (block.outputStartLine === null || block.outputEndLine === null) return "";
  const buf = term.buffer.active;
  const lines: string[] = [];
  for (let i = block.outputStartLine; i < block.outputEndLine; i++) {
    const line = buf.getLine(i);
    if (line) lines.push(line.translateToString(true));
  }
  // Drop trailing blank lines that come from prompt-padding shells.
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }
  return lines.join("\n");
}

export function disposeBlocks(blocks: TrackedBlock[]): void {
  for (const b of blocks) {
    b.decoration?.dispose();
    b.promptMarker.dispose();
  }
  blocks.length = 0;
}

export function jumpToBlock(term: XTerm, blocks: TrackedBlock[], dir: -1 | 1): void {
  const live = blocks.filter((b) => b.promptMarker.line >= 0);
  if (live.length === 0) return;
  const viewportTop = term.buffer.active.viewportY;
  let nearestAboveIdx = -1;
  for (let i = 0; i < live.length; i++) {
    if (live[i].promptMarker.line <= viewportTop) nearestAboveIdx = i;
    else break;
  }
  const targetIdx =
    dir === -1
      ? Math.max(0, nearestAboveIdx === -1 ? 0 : nearestAboveIdx - 1)
      : Math.min(live.length - 1, nearestAboveIdx + 1);
  const target = live[targetIdx];
  if (!target) return;
  term.scrollToLine(Math.max(0, target.promptMarker.line - 1));
  flashBlock(term, target);
}

const FLASH_MS = 700;

/** Briefly highlight a block's marker — used after a jump so the eye can
 * follow it. */
function flashBlock(term: XTerm, block: TrackedBlock): void {
  const flash = term.registerDecoration({
    marker: block.promptMarker,
    width: 1,
    x: 0,
    layer: "top",
    backgroundColor: "#fbbf24",
  }) as IDecoration | null;
  if (!flash) return;
  flash.onRender((el) => {
    el.classList.add("blaze-block-flash");
  });
  setTimeout(() => flash.dispose(), FLASH_MS);
}
