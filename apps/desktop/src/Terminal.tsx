import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { ClipboardAddon } from "@xterm/addon-clipboard";
import { SearchAddon } from "@xterm/addon-search";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";
import "./Terminal.css";
import { useSettings } from "./state/SettingsContext";
import { SearchBar } from "./components/SearchBar";
import { showToast } from "./components/Toast";
import {
  applyBlockEvent,
  attachParsedToLastActive,
  commandFor,
  disposeBlocks,
  jumpToBlock,
  lastDoneBlock,
  readBlockOutput,
  recentBlockSnapshots,
  type BlockEvent,
  type BlockSnapshot,
  type TrackedBlock,
} from "./blocks";
import { SaveRunbookDialog } from "./components/SaveRunbookDialog";
import type { ParsedEvent, PickerAction } from "./state/parsed";
import { ParsedPicker, type SmartActionInvoke } from "./components/ParsedPicker";
import { smartActionFor } from "./state/smartActions";
import { indexParsedBlock, type LinkIndex } from "./linkIndex";
import { setCwd as setCwdInMap, getCwd } from "./state/cwdMap";
import {
  TRANSFER_MIME,
  dispatchTransferRequest,
  type TransferMode,
  type TransferPayload,
} from "./state/transfer";
import { disposeLinkDecorations, installLinkDecorations } from "./decorations";
import type { LinkEntry } from "./linkIndex";
import { AiPrompt } from "./components/AiPrompt";

interface BlockEventCwd {
  kind: "cwd";
  path: string;
}

interface TerminalProps {
  sessionId: string;
  active: boolean;
}

const isMacPlatform = navigator.platform.toLowerCase().includes("mac");

const decodeBase64 = (b64: string): Uint8Array => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

export function Terminal({ sessionId, active }: TerminalProps) {
  const settings = useSettings();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const blocksRef = useRef<TrackedBlock[]>([]);
  const linkIndexRef = useRef<LinkIndex>(new Map());
  const installedDecorationsRef = useRef<ReturnType<typeof installLinkDecorations>>([]);
  // handlePickerAction is recreated each render; the link provider closes
  // over a ref so it always invokes the current handler.
  const actionHandlerRef = useRef<((action: PickerAction | SmartActionInvoke) => void) | null>(
    null
  );

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<{
    resultIndex: number;
    resultCount: number;
  } | null>(null);
  const [pickerBlock, setPickerBlock] = useState<TrackedBlock | null>(null);
  const [saveSnapshots, setSaveSnapshots] = useState<BlockSnapshot[] | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new XTerm({
      fontFamily: settings.appearance.font_family,
      fontSize: settings.appearance.font_size,
      lineHeight: settings.appearance.line_height,
      cursorBlink: settings.terminal.cursor_blink,
      allowProposedApi: true,
      theme: {
        background: "#0a0a0a",
        foreground: "#f0f0f0",
        cursor: "#f0f0f0",
        selectionBackground: "#3a3a3a",
      },
      scrollback: settings.terminal.scrollback_lines,
    });

    const fitAddon = new FitAddon();
    const clipboardAddon = new ClipboardAddon();
    const searchAddon = new SearchAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(clipboardAddon);
    term.loadAddon(searchAddon);
    term.open(container);

    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl);
    } catch (e) {
      console.warn("WebGL renderer unavailable, using DOM:", e);
    }

    fitAddon.fit();
    termRef.current = term;
    fitRef.current = fitAddon;
    searchRef.current = searchAddon;

    searchAddon.onDidChangeResults((event) => setSearchResults(event ?? null));

    // Inline link interactions are powered by per-span IDecoration overlays
    // rather than xterm's LinkProvider — the decoration's element is a real
    // DOM node we own, which lets us attach drag handlers in addition to
    // click/hover. Decorations are installed each time a parsed block lands
    // (see the listener for `pty:<id>:parsed` below).
    const onLinkClick = (entry: LinkEntry, event: MouseEvent) => {
      const handler = actionHandlerRef.current;
      if (!handler) return;
      const wantSmart = isMacPlatform ? event.metaKey : event.ctrlKey;
      if (wantSmart && entry.item.path) {
        smartActionFor(entry.item.path).then((resolved) => {
          if (resolved) handler({ kind: "smart", resolved });
          else handler(entry.item.defaultAction);
        });
      } else {
        handler(entry.item.defaultAction);
      }
    };
    const onLinkDragStart = (entry: LinkEntry, event: DragEvent) => {
      if (!event.dataTransfer || !entry.item.path) return;
      const payload: TransferPayload = {
        sourcePaneId: sessionId,
        sourceCwd: getCwd(sessionId),
        sourcePath: entry.item.path,
        label: entry.item.label,
        isDir: entry.item.icon === "📁",
      };
      event.dataTransfer.effectAllowed = "copyMove";
      event.dataTransfer.setData(TRANSFER_MIME, JSON.stringify(payload));
    };

    let unlistenData: UnlistenFn | null = null;
    let unlistenBlock: UnlistenFn | null = null;
    let unlistenParsed: UnlistenFn | null = null;
    let unlistenExit: UnlistenFn | null = null;
    let cancelled = false;

    (async () => {
      unlistenData = await listen<string>(`pty:${sessionId}:data`, (event) => {
        term.write(decodeBase64(event.payload));
      });

      unlistenBlock = await listen<BlockEvent | BlockEventCwd>(
        `pty:${sessionId}:block`,
        (event) => {
          if (event.payload.kind === "cwd") {
            setCwdInMap(sessionId, event.payload.path);
            return;
          }
          applyBlockEvent(term, blocksRef.current, event.payload as BlockEvent);
        }
      );

      unlistenParsed = await listen<ParsedEvent>(`pty:${sessionId}:parsed`, (event) => {
        // Attach to the most recent block (running OR done) — Tauri doesn't
        // guarantee cross-channel ordering, so the block_event for OutputEnd
        // may still be in flight when this fires.
        const target = attachParsedToLastActive(blocksRef.current, event.payload.parsed);
        if (!target || target.outputStartLine === null) return;
        // Use the cursor position as a fallback for outputEndLine if the
        // block_event hasn't been processed yet.
        const buf = term.buffer.active;
        const endLine = target.outputEndLine ?? buf.baseY + buf.cursorY;
        // Index into a *fresh* per-block sub-index so installLinkDecorations
        // only registers spans for the just-parsed block (the global
        // linkIndexRef accumulates everything for jump-to-line callers).
        const blockIndex: LinkIndex = new Map();
        indexParsedBlock(term, event.payload.parsed, target.outputStartLine, endLine, blockIndex);
        for (const [k, v] of blockIndex) {
          const merged = (linkIndexRef.current.get(k) ?? []).concat(v);
          linkIndexRef.current.set(k, merged);
        }
        const newDecorations = installLinkDecorations(
          term,
          blockIndex,
          onLinkClick,
          onLinkDragStart
        );
        installedDecorationsRef.current.push(...newDecorations);
        term.refresh(0, term.rows - 1);
      });

      unlistenExit = await listen<{ id: string }>(`pty:${sessionId}:exit`, () => {
        term.writeln("\r\n\x1b[2m[process exited]\x1b[0m");
      });

      if (cancelled) return;
      try {
        await invoke("pty_spawn", {
          args: {
            id: sessionId,
            cols: term.cols,
            rows: term.rows,
            shell: settings.terminal.shell,
          },
        });
      } catch (e) {
        term.writeln(`\r\n\x1b[31mfailed to spawn pty: ${String(e)}\x1b[0m`);
      }
    })();

    const dataDisposable = term.onData((data) => {
      invoke("pty_write", { id: sessionId, data }).catch((e) =>
        console.error("pty_write failed:", e)
      );
    });

    const resizeDisposable = term.onResize(({ cols, rows }) => {
      invoke("pty_resize", { id: sessionId, cols, rows }).catch((e) =>
        console.error("pty_resize failed:", e)
      );
    });

    const ro = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch {
        /* hidden container; ignore */
      }
    });
    ro.observe(container);

    return () => {
      cancelled = true;
      ro.disconnect();
      dataDisposable.dispose();
      resizeDisposable.dispose();
      unlistenData?.();
      unlistenBlock?.();
      unlistenParsed?.();
      unlistenExit?.();
      invoke("pty_kill", { id: sessionId }).catch(() => {});
      disposeBlocks(blocksRef.current);
      disposeLinkDecorations(installedDecorationsRef.current);
      linkIndexRef.current.clear();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      searchRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    if (active && !searchOpen) termRef.current?.focus();
  }, [active, searchOpen]);

  // Active-pane shortcuts: search, block nav, block actions.
  useEffect(() => {
    if (!active) return;
    const isMac = navigator.platform.toLowerCase().includes("mac");

    const onKey = async (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod || e.altKey) return;

      if (!e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        e.stopPropagation();
        setSearchOpen(true);
        return;
      }
      if (!e.shiftKey && (e.key === "[" || e.key === "]")) {
        const term = termRef.current;
        if (!term) return;
        jumpToBlock(term, blocksRef.current, e.key === "[" ? -1 : 1);
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Block actions — operate on the most recently completed block.
      const term = termRef.current;
      if (!term) return;
      const block = lastDoneBlock(blocksRef.current);

      // Cmd/Ctrl+Shift+K → copy command of last block
      if (e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        e.stopPropagation();
        if (!block) {
          showToast("No completed block yet");
          return;
        }
        const cmd = commandFor(term, block);
        await copyToClipboard(cmd);
        showToast(cmd ? `Copied command: ${truncate(cmd)}` : "Empty command");
        return;
      }
      // Cmd/Ctrl+Shift+O → copy output of last block
      if (e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        e.stopPropagation();
        if (!block) {
          showToast("No completed block yet");
          return;
        }
        const out = readBlockOutput(term, block);
        await copyToClipboard(out);
        const lines = out ? out.split("\n").length : 0;
        showToast(out ? `Copied output (${lines} line${lines === 1 ? "" : "s"})` : "Empty output");
        return;
      }
      // Cmd/Ctrl+Shift+S → save selected blocks as runbook
      if (e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        e.stopPropagation();
        const term = termRef.current;
        if (!term) return;
        const snaps = recentBlockSnapshots(term, blocksRef.current, 25);
        if (snaps.length === 0) {
          showToast("No completed commands to save");
          return;
        }
        setSaveSnapshots(snaps);
        return;
      }

      // Cmd/Ctrl+K → open AI translate prompt
      if (!e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        e.stopPropagation();
        setAiOpen(true);
        return;
      }
      // Cmd/Ctrl+J → open parsed-block picker for last block with a result
      if (!e.shiftKey && e.key.toLowerCase() === "j") {
        e.preventDefault();
        e.stopPropagation();
        const blocks = blocksRef.current;
        const target = [...blocks].reverse().find((b) => b.parsed !== null);
        if (!target) {
          showToast("No parsed block (try `ls -l`)");
          return;
        }
        setPickerBlock(target);
        return;
      }
      // Cmd/Ctrl+R → rerun last command
      if (!e.shiftKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        e.stopPropagation();
        if (!block) {
          showToast("No completed block to rerun");
          return;
        }
        const cmd = commandFor(term, block);
        if (!cmd) {
          showToast("Could not extract command");
          return;
        }
        await invoke("pty_write", { id: sessionId, data: cmd + "\r" }).catch((err) =>
          console.error("pty_write failed:", err)
        );
        showToast(`Rerun: ${truncate(cmd)}`);
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [active, sessionId]);

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchTerm("");
    setSearchResults(null);
    searchRef.current?.clearDecorations();
    termRef.current?.focus();
  };

  // Keep the ref pointing at the latest handler so the link provider —
  // which is registered once on mount — always invokes the current closure.
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  actionHandlerRef.current = (action) => void handlePickerAction(action);

  const handlePickerAction = async (action: PickerAction | SmartActionInvoke) => {
    const write = (cmd: string) => invoke("pty_write", { id: sessionId, data: `${cmd}\r` });
    if (action.kind === "smart") {
      // Smart action commands are pre-resolved + shell-quoted by Rust.
      await write(action.resolved.command);
      showToast(`${action.resolved.label}: ${truncate(action.resolved.command, 60)}`);
      return;
    }
    switch (action.kind) {
      case "cd":
        await write(`cd ${shellQuote(action.path)} && ls`);
        break;
      case "open":
        await write(`open ${shellQuote(action.path)}`);
        break;
      case "open_at_line":
        // ${EDITOR:-vim} +<line> <path> — works for vim/nvim/nano/code-as-CLI
        // Tradeoff: requires the user's $EDITOR to support `+N` line jumps.
        await write(`\${EDITOR:-vim} +${action.line} ${shellQuote(action.path)}`);
        break;
      case "git_diff":
        await write(`git diff -- ${shellQuote(action.path)}`);
        break;
      case "git_add":
        await write(`git add -- ${shellQuote(action.path)}`);
        break;
      case "git_restore":
        await write(`git restore -- ${shellQuote(action.path)}`);
        break;
      case "copy":
        await copyToClipboard(action.text);
        showToast(`Copied: ${truncate(action.text)}`);
        break;
    }
  };

  // ---- Drop target: receive a Blaze pane-to-pane transfer ----
  const modeFromEvent = (e: { altKey: boolean; shiftKey: boolean }): TransferMode => {
    // Alt = symlink takes priority over Shift = move (matches macOS Finder).
    if (e.altKey) return "symlink";
    if (e.shiftKey) return "move";
    return "copy";
  };

  const applyDropClasses = (el: HTMLElement, mode: TransferMode, isHover: boolean) => {
    el.classList.toggle("drop-target", isHover);
    el.classList.toggle("drop-target-move", isHover && mode === "move");
    el.classList.toggle("drop-target-symlink", isHover && mode === "symlink");
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes(TRANSFER_MIME)) return;
    e.preventDefault();
    const mode = modeFromEvent(e);
    e.dataTransfer.dropEffect = mode === "symlink" ? "link" : mode === "move" ? "move" : "copy";
    applyDropClasses(e.currentTarget, mode, true);
  };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    applyDropClasses(e.currentTarget, "copy", false);
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    applyDropClasses(e.currentTarget, "copy", false);
    const raw = e.dataTransfer.getData(TRANSFER_MIME);
    if (!raw) return;
    e.preventDefault();
    let payload: TransferPayload;
    try {
      payload = JSON.parse(raw) as TransferPayload;
    } catch (err) {
      console.warn("invalid transfer payload:", err);
      return;
    }
    if (payload.sourcePaneId === sessionId) {
      // Self-drop is a no-op (per spec).
      return;
    }
    dispatchTransferRequest({
      source: payload,
      destPaneId: sessionId,
      destCwd: getCwd(sessionId),
      mode: modeFromEvent(e),
      conflict: "overwrite",
    });
  };

  return (
    <div
      className="terminal-host-wrapper"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div ref={containerRef} className="terminal-host" />
      {searchOpen && (
        <SearchBar
          value={searchTerm}
          matchCount={searchResults}
          onChange={(v) => {
            setSearchTerm(v);
            if (v) searchRef.current?.findNext(v, { incremental: true, decorations: SEARCH_DECOR });
            else searchRef.current?.clearDecorations();
          }}
          onNext={() => {
            if (searchTerm) searchRef.current?.findNext(searchTerm, { decorations: SEARCH_DECOR });
          }}
          onPrev={() => {
            if (searchTerm)
              searchRef.current?.findPrevious(searchTerm, { decorations: SEARCH_DECOR });
          }}
          onClose={closeSearch}
        />
      )}
      {pickerBlock && pickerBlock.parsed && (
        <ParsedPicker
          parsed={pickerBlock.parsed}
          command={pickerBlock.capturedCommand ?? ""}
          sourcePaneId={sessionId}
          onAction={handlePickerAction}
          onClose={() => setPickerBlock(null)}
        />
      )}
      {saveSnapshots && (
        <SaveRunbookDialog
          snapshots={saveSnapshots}
          onSaved={(result) => {
            setSaveSnapshots(null);
            showToast(`Saved: ${result.filename}`);
          }}
          onClose={() => setSaveSnapshots(null)}
        />
      )}
      {aiOpen && (
        <AiPrompt
          onRun={(cmd) => {
            invoke("pty_write", { id: sessionId, data: cmd.trimEnd() + "\r" }).catch((err) =>
              console.error("pty_write failed:", err)
            );
          }}
          onClose={() => setAiOpen(false)}
        />
      )}
    </div>
  );
}

/** Quote a path for safe inclusion in a shell command. Wraps in single
 * quotes and escapes any embedded single quotes via `'\''` — works for any
 * POSIX shell. */
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    console.error("clipboard write failed:", e);
  }
}

const truncate = (s: string, n = 60): string => (s.length > n ? s.slice(0, n - 1) + "…" : s);

const SEARCH_DECOR = {
  matchBackground: "#3b82f680",
  matchBorder: "#3b82f6",
  matchOverviewRuler: "#3b82f6",
  activeMatchBackground: "#f59e0bcc",
  activeMatchBorder: "#f59e0b",
  activeMatchColorOverviewRuler: "#f59e0b",
};
