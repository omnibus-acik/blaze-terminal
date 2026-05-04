// Inline link decorations for parsed-block file/folder names.
//
// xterm.js's `registerLinkProvider` API gives us clickable hyperlinks but
// no DOM access — we can't make them draggable. Switching to
// `registerDecoration` per linkable span gives us the actual element, so we
// own click, hover, AND dragstart on the rendered text.

import type { IDecoration, IMarker, Terminal as XTerm } from "@xterm/xterm";
import type { LinkEntry, LinkIndex } from "./linkIndex";

export type LinkClickHandler = (entry: LinkEntry, event: MouseEvent) => void;

export type LinkDragStartHandler = (entry: LinkEntry, event: DragEvent) => void;

interface Installed {
  marker: IMarker;
  decoration: IDecoration;
}

/**
 * Install one decoration per linkable span in `index`. The caller is
 * expected to dispose any prior install before calling again, by passing
 * the previously returned array to `disposeLinkDecorations`.
 */
export function installLinkDecorations(
  term: XTerm,
  index: LinkIndex,
  onClick: LinkClickHandler,
  onDragStart: LinkDragStartHandler
): Installed[] {
  const out: Installed[] = [];
  const buffer = term.buffer.active;
  const cursorAbsLine = buffer.baseY + buffer.cursorY;

  for (const [xtermLine1Based, entries] of index.entries()) {
    const absLine = xtermLine1Based - 1; // index keys are 1-based
    const offset = absLine - cursorAbsLine;
    const marker = term.registerMarker(offset);
    if (!marker) continue;

    for (const entry of entries) {
      const decoration =
        (term.registerDecoration({
          marker,
          // registerDecoration's x/width are 0-based cells.
          x: entry.startCol - 1,
          width: entry.endCol - entry.startCol + 1,
          layer: "top",
        }) as IDecoration | null) ?? null;
      if (!decoration) continue;

      decoration.onRender((el) => {
        // Idempotent — onRender can fire multiple times as xterm
        // re-renders. We only want one set of listeners.
        if (el.dataset.blazeLink === "1") return;
        el.dataset.blazeLink = "1";
        el.classList.add("blaze-link");
        el.title = entry.text;
        el.draggable = true;
        el.style.cursor = "pointer";

        el.addEventListener("click", (e) => {
          // Don't override xterm's selection-by-drag for genuine
          // selection gestures: only fire on click without shift+drag,
          // i.e. real click events with no in-progress selection.
          if (window.getSelection()?.toString()) return;
          onClick(entry, e);
          e.stopPropagation();
        });

        el.addEventListener("dragstart", (e) => onDragStart(entry, e));
      });

      out.push({ marker, decoration });
    }
  }
  return out;
}

export function disposeLinkDecorations(installed: Installed[]): void {
  for (const i of installed) {
    i.decoration.dispose();
    i.marker.dispose();
  }
  installed.length = 0;
}
