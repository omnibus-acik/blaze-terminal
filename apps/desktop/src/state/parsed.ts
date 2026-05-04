// Mirrors the `ParsedBlock` enum from `crates/blaze-parsers/src/lib.rs`.
// Tagged union with a `kind` discriminator (serde rename_all = snake_case).

export type LsEntryKind = "file" | "dir" | "symlink" | "other";

export interface LsEntry {
  kind: LsEntryKind;
  name: string;
  size: number | null;
  mode: string | null;
  target: string | null;
}

export interface FindEntry {
  path: string;
  looks_like_dir: boolean;
}

export interface GrepMatch {
  path: string;
  line: number;
  text: string;
}

export type GitFileState =
  | "staged"
  | "modified"
  | "deleted"
  | "renamed"
  | "untracked"
  | "conflicted";

export interface GitStatusEntry {
  state: GitFileState;
  path: string;
  original_path: string | null;
}

export type ParsedBlock =
  | { kind: "ls"; entries: LsEntry[]; truncated: boolean }
  | { kind: "find"; entries: FindEntry[]; truncated: boolean }
  | { kind: "grep"; matches: GrepMatch[]; truncated: boolean }
  | { kind: "git_status"; entries: GitStatusEntry[]; truncated: boolean };

export interface ParsedEvent {
  parsed: ParsedBlock;
  command: string;
}

// ---- Picker normalisation ----

export type PickerAction =
  | { kind: "cd"; path: string }
  | { kind: "open"; path: string }
  | { kind: "open_at_line"; path: string; line: number }
  | { kind: "copy"; text: string }
  | { kind: "git_diff"; path: string }
  | { kind: "git_add"; path: string }
  | { kind: "git_restore"; path: string };

export interface PickerItem {
  id: string;
  icon: string;
  label: string;
  /** Optional secondary line below the label (path tail, line number, etc.) */
  sublabel: string | null;
  /** Right-aligned metadata (size, exit code, mode bits, …) */
  meta: string | null;
  defaultAction: PickerAction;
  defaultActionLabel: string;
  /** File path this row refers to — used to resolve smart actions. `null`
   * for rows that aren't really file references (none currently). */
  path: string | null;
}

export function pickerItems(parsed: ParsedBlock): PickerItem[] {
  switch (parsed.kind) {
    case "ls":
      return parsed.entries.map((e, i) => fromLs(e, i));
    case "find":
      return parsed.entries.map((e, i) => fromFind(e, i));
    case "grep":
      return parsed.matches.map((m, i) => fromGrep(m, i));
    case "git_status":
      return parsed.entries.map((e, i) => fromGitStatus(e, i));
  }
}

function fromLs(e: LsEntry, i: number): PickerItem {
  if (e.kind === "dir") {
    return {
      id: `ls-${i}`,
      icon: "📁",
      label: e.name,
      sublabel: null,
      meta: e.mode,
      defaultAction: { kind: "cd", path: e.name },
      defaultActionLabel: "cd",
      path: e.name,
    };
  }
  if (e.kind === "symlink") {
    return {
      id: `ls-${i}`,
      icon: "↪",
      label: e.name,
      sublabel: e.target ? `→ ${e.target}` : null,
      meta: e.mode,
      defaultAction: { kind: "open", path: e.name },
      defaultActionLabel: "open",
      path: e.name,
    };
  }
  return {
    id: `ls-${i}`,
    icon: "📄",
    label: e.name,
    sublabel: null,
    meta: e.size !== null ? formatSize(e.size) : e.mode,
    defaultAction: { kind: "copy", text: e.name },
    defaultActionLabel: "copy path",
    path: e.name,
  };
}

function fromFind(e: FindEntry, i: number): PickerItem {
  if (e.looks_like_dir) {
    return {
      id: `find-${i}`,
      icon: "📁",
      label: e.path,
      sublabel: null,
      meta: null,
      defaultAction: { kind: "cd", path: e.path },
      defaultActionLabel: "cd",
      path: e.path,
    };
  }
  return {
    id: `find-${i}`,
    icon: "📄",
    label: e.path,
    sublabel: null,
    meta: null,
    defaultAction: { kind: "copy", text: e.path },
    defaultActionLabel: "copy path",
    path: e.path,
  };
}

function fromGrep(m: GrepMatch, i: number): PickerItem {
  return {
    id: `grep-${i}`,
    icon: "🔍",
    label: m.text,
    sublabel: `${m.path}:${m.line}`,
    meta: null,
    defaultAction: { kind: "open_at_line", path: m.path, line: m.line },
    defaultActionLabel: "open at line",
    path: m.path,
  };
}

function fromGitStatus(e: GitStatusEntry, i: number): PickerItem {
  const icon = gitIcon(e.state);
  const sublabel = e.original_path ? `was ${e.original_path}` : null;
  // Default action: diff for tracked changes, add for untracked.
  if (e.state === "untracked") {
    return {
      id: `git-${i}`,
      icon,
      label: e.path,
      sublabel,
      meta: e.state,
      defaultAction: { kind: "git_add", path: e.path },
      defaultActionLabel: "git add",
      path: e.path,
    };
  }
  if (e.state === "staged") {
    return {
      id: `git-${i}`,
      icon,
      label: e.path,
      sublabel,
      meta: e.state,
      defaultAction: { kind: "git_diff", path: e.path },
      defaultActionLabel: "git diff --staged",
      path: e.path,
    };
  }
  return {
    id: `git-${i}`,
    icon,
    label: e.path,
    sublabel,
    meta: e.state,
    defaultAction: { kind: "git_diff", path: e.path },
    defaultActionLabel: "git diff",
    path: e.path,
  };
}

function gitIcon(state: GitFileState): string {
  switch (state) {
    case "staged":
      return "✚";
    case "modified":
      return "●";
    case "deleted":
      return "✗";
    case "renamed":
      return "→";
    case "untracked":
      return "?";
    case "conflicted":
      return "⚠";
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = bytes / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size < 10 ? 1 : 0)} ${units[unit]}`;
}
