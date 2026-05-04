// Link index for inline-clickable file/folder names in command output.
//
// When a block parses successfully, we scan the buffer lines between its
// outputStartLine and outputEndLine, locate each parsed entry's path (or
// basename) in the rendered text, and store the (col_start, col_end) span
// keyed by 1-based xterm bufferLineNumber. The Terminal's xterm
// LinkProvider then serves these spans on demand for hover / click.

import type { Terminal as XTerm } from "@xterm/xterm";
import { pickerItems, type ParsedBlock, type PickerItem } from "./state/parsed";

export interface LinkEntry {
  /** 1-based, inclusive */
  startCol: number;
  /** 1-based, inclusive */
  endCol: number;
  text: string;
  item: PickerItem;
}

/** Map keyed by xterm 1-based bufferLineNumber. */
export type LinkIndex = Map<number, LinkEntry[]>;

/**
 * Scan a parsed block's buffer lines and record clickable spans for every
 * entry that has a `path`. Mutates `index` in place.
 *
 * `startLine` / `endLine` are absolute (0-based) buffer line indices, as
 * captured at OSC 133;C / 133;D event time.
 */
export function indexParsedBlock(
  term: XTerm,
  parsed: ParsedBlock,
  startLine: number,
  endLine: number,
  index: LinkIndex
): void {
  const items = pickerItems(parsed);
  if (items.length === 0) return;

  // Bound the scan to lines that actually exist in the buffer (the block
  // could have been partially evicted from scrollback already).
  const lo = Math.max(0, startLine);
  const hi = Math.max(lo, endLine);

  // Track which item indices we've matched so we don't double-link the same
  // entry on multiple lines (relevant when names recur — e.g. "test" the
  // folder appearing in another file's name on a later line).
  const matched = new Set<number>();

  for (let line = lo; line < hi; line++) {
    const lineObj = term.buffer.active.getLine(line);
    if (!lineObj) continue;
    const lineText = lineObj.translateToString(true);

    for (let i = 0; i < items.length; i++) {
      if (matched.has(i)) continue;
      const item = items[i];
      if (!item.path) continue;

      // Try the full path first, then the basename. ls -l renders just the
      // basename; find renders the full path.
      const candidates = uniqueNonEmpty([item.path, basename(item.path)]);
      let col = -1;
      let found = "";
      for (const needle of candidates) {
        col = lastWholeWordIndex(lineText, needle);
        if (col >= 0) {
          found = needle;
          break;
        }
      }
      if (col < 0) continue;

      const xtermLine = line + 1; // xterm's link API is 1-based on Y
      const ranges = index.get(xtermLine) ?? [];
      ranges.push({
        startCol: col + 1, // and 1-based on X
        endCol: col + found.length,
        text: found,
        item,
      });
      index.set(xtermLine, ranges);
      matched.add(i);
    }
  }
}

const basename = (p: string): string => {
  const i = p.lastIndexOf("/");
  return i < 0 ? p : p.slice(i + 1);
};

const uniqueNonEmpty = (xs: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    if (!x) continue;
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
};

/**
 * Find `needle` in `haystack` at a position that's preceded and followed by
 * a non-word boundary — i.e. not embedded inside a longer identifier. Also
 * tolerates the typical surrounding chars in `ls`/`find`/`git status`
 * output: spaces, tabs, `/`, `:`, end of line.
 */
function lastWholeWordIndex(haystack: string, needle: string): number {
  if (!needle) return -1;
  // Search from the right because in `ls -l` the name is at the end.
  let from = haystack.length;
  while (from >= 0) {
    const idx = haystack.lastIndexOf(needle, from);
    if (idx < 0) return -1;
    const before = idx === 0 ? "" : haystack[idx - 1];
    const after = idx + needle.length >= haystack.length ? "" : haystack[idx + needle.length];
    if (isBoundary(before) && isBoundary(after)) return idx;
    from = idx - 1;
  }
  return -1;
}

function isBoundary(ch: string): boolean {
  if (ch === "") return true;
  return /[\s/:|>"'`()[\]{}]/.test(ch);
}
