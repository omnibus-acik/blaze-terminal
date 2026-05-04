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

export type TransferMode = "copy" | "move" | "symlink";

export type ConflictPolicy = "overwrite" | "skip";

export interface TransferRequest {
  source: TransferPayload;
  destPaneId: string;
  destCwd: string | null;
  mode: TransferMode;
  conflict: ConflictPolicy;
}

/** Resolve a source path to an absolute path using the source pane's cwd.
 * If sourcePath is already absolute, returns it unchanged. */
export function resolveSourcePath(payload: TransferPayload): string {
  if (payload.sourcePath.startsWith("/")) return payload.sourcePath;
  if (!payload.sourceCwd) return payload.sourcePath;
  const rel = payload.sourcePath.replace(/^\.\//, "");
  return joinPath(payload.sourceCwd, rel);
}

function joinPath(a: string, b: string): string {
  if (a.endsWith("/")) return a + b;
  return `${a}/${b}`;
}

/** POSIX-safe single-quote escape (matches `blaze-actions::template::shell_quote`). */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/** Build the cp/mv/ln command that performs this transfer. Run in the
 * destination pane so its cwd is the implicit target directory.
 *
 * Flag rationale:
 * - cp: -R (recurse into dirs), -p (preserve perms/timestamps),
 *       -n adds no-clobber for `skip` conflict policy.
 * - mv: -n adds no-clobber. We omit -i for "overwrite" because users have
 *       already approved via the confirm dialog.
 * - ln: -s (symbolic). Conflict policy is irrelevant — ln won't replace an
 *       existing target without -f, and we don't ask for that. */
export function buildTransferCommand(req: TransferRequest): string {
  const absSrc = resolveSourcePath(req.source);
  const dst = req.destCwd ? `${req.destCwd}/` : "./";
  const skip = req.conflict === "skip";
  switch (req.mode) {
    case "move":
      return `mv${skip ? " -n" : ""} ${shellQuote(absSrc)} ${shellQuote(dst)}`;
    case "symlink":
      return `ln -s ${shellQuote(absSrc)} ${shellQuote(dst)}`;
    case "copy":
    default:
      return `cp -Rp${skip ? "n" : ""} ${shellQuote(absSrc)} ${shellQuote(dst)}`;
  }
}

/** Window-level event used by drop-target panes to ask the App component
 * to open the confirm dialog. Going through `window` keeps Terminal
 * decoupled from app-level dialog state plumbing. */
export const TRANSFER_REQUEST_EVENT = "blaze:transfer-request";

declare global {
  interface WindowEventMap {
    [TRANSFER_REQUEST_EVENT]: CustomEvent<TransferRequest>;
  }
}

export function dispatchTransferRequest(req: TransferRequest): void {
  window.dispatchEvent(new CustomEvent(TRANSFER_REQUEST_EVENT, { detail: req }));
}

// ---- Path safety ----

/** Critical system root directories. Drops onto these (or their subtrees)
 * require typed confirmation per spec §5.6.5. We err on the side of
 * paranoia: any descendant of these is protected. */
const PROTECTED_ROOTS = [
  "/etc",
  "/usr",
  "/var",
  "/bin",
  "/sbin",
  "/System",
  "/Library",
  "/private",
  "/boot",
  "/dev",
  "/proc",
  "/sys",
];

/**
 * True when `destAbs` lands on a system root, the user's home directory
 * itself (subdirectories are fine — `~/projects/` is normal work), or the
 * filesystem root.
 */
export function isProtectedPath(destAbs: string | null): boolean {
  if (!destAbs) return false;
  const norm = destAbs.replace(/\/+$/, "") || "/";
  if (norm === "/") return true;
  // Home directory itself (not its subtree)
  if (/^\/Users\/[^/]+$/.test(norm)) return true;
  if (/^\/home\/[^/]+$/.test(norm)) return true;
  // Critical roots + descendants
  return PROTECTED_ROOTS.some((r) => norm === r || norm.startsWith(`${r}/`));
}

/** The exact phrase the user must type to override path-safety. */
export const SAFETY_PHRASE = "OVERWRITE";
