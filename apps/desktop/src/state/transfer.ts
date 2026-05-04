// Pane-to-pane file transfer model.
//
// Drag payload format passed via HTML5 dataTransfer. The custom MIME type
// keeps Blaze's drags distinguishable from arbitrary external drops (e.g.
// from Finder), which we don't yet handle.

export const TRANSFER_MIME = "application/x-blaze-transfer";

export interface TransferPayload {
  /** PTY session id of the pane the file came from. */
  sourcePaneId: string;
  /** The cwd of the source pane at the time the file was rendered, used to
   * resolve `sourcePath` to an absolute path. May be null if shell
   * integration hasn't emitted a cwd yet for that pane. */
  sourceCwd: string | null;
  /** Path as rendered (often a basename for `ls -l`, full path for `find`). */
  sourcePath: string;
  /** Display label — what the user dragged. */
  label: string;
  /** Whether the source is a folder. Drives the cp/rsync flag selection. */
  isDir: boolean;
}

export type TransferMode = "copy" | "move";

export interface TransferRequest {
  source: TransferPayload;
  destPaneId: string;
  destCwd: string | null;
  mode: TransferMode;
}

/**
 * Resolve a source path to an absolute path using the source pane's cwd.
 * If sourcePath is already absolute, returns it unchanged.
 */
export function resolveSourcePath(payload: TransferPayload): string {
  if (payload.sourcePath.startsWith("/")) return payload.sourcePath;
  if (!payload.sourceCwd) return payload.sourcePath;
  // Strip leading "./" since the cwd join handles it.
  const rel = payload.sourcePath.replace(/^\.\//, "");
  return joinPath(payload.sourceCwd, rel);
}

function joinPath(a: string, b: string): string {
  if (a.endsWith("/")) return a + b;
  return `${a}/${b}`;
}

/**
 * POSIX-safe single-quote escape (matches `blaze-actions::template::shell_quote`).
 */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/**
 * Build the cp/rsync command that performs this transfer. Run in the
 * destination pane so its cwd is the implicit target directory.
 */
export function buildTransferCommand(req: TransferRequest): string {
  const absSrc = resolveSourcePath(req.source);
  const dst = req.destCwd ? `${req.destCwd}/` : "./";
  if (req.mode === "move") {
    // mv preserves perms by default; works across filesystems via
    // copy-then-delete. -i prompts on conflict (we'll wire conflict UI
    // properly in a follow-up).
    return `mv -i ${shellQuote(absSrc)} ${shellQuote(dst)}`;
  }
  // Default copy: -R for directories, -p for permissions/timestamps.
  // rsync with --info=progress2 + cancel/resume comes in a follow-up.
  return `cp -Rp ${shellQuote(absSrc)} ${shellQuote(dst)}`;
}

/**
 * Window-level event used by drop-target panes to ask the top-level App
 * component to open the confirm dialog. Going through `window` keeps the
 * Terminal component decoupled from app-level dialog state plumbing.
 */
export const TRANSFER_REQUEST_EVENT = "blaze:transfer-request";

declare global {
  interface WindowEventMap {
    [TRANSFER_REQUEST_EVENT]: CustomEvent<TransferRequest>;
  }
}

export function dispatchTransferRequest(req: TransferRequest): void {
  window.dispatchEvent(new CustomEvent(TRANSFER_REQUEST_EVENT, { detail: req }));
}
