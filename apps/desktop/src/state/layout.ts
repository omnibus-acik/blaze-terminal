// Layout model for tabs and recursive split panes.
//
// A `Tab` owns a `Node` tree. A `Node` is either a `Leaf` (one pane / PTY) or a
// `Split` (two children divided horizontally or vertically with a ratio in
// [0.1, 0.9]). All mutations go through the reducer so undo/redo and layout
// persistence (P8) can hook in cleanly later.

export type Direction = "horizontal" | "vertical";

export interface Leaf {
  kind: "leaf";
  id: string;
  /** Profile id this pane was opened with. `null` means "use default". */
  profileId?: string | null;
  /** One-shot command to write into the PTY immediately after spawn —
   *  used by the SSH picker to land in `ssh <alias>` automatically.
   *  Cleared by the Terminal once it has fired so re-renders don't
   *  re-run it. */
  initialCommand?: string | null;
}

export interface Split {
  kind: "split";
  id: string;
  direction: Direction;
  ratio: number;
  a: Node;
  b: Node;
}

export type Node = Leaf | Split;

export interface Tab {
  id: string;
  title: string;
  root: Node;
  activeLeafId: string;
}

export interface LayoutState {
  tabs: Tab[];
  activeTabId: string;
}

export type LayoutAction =
  | {
      type: "newTab";
      profileId?: string | null;
      title?: string;
      initialCommand?: string | null;
    }
  | { type: "closeTab"; tabId: string }
  | { type: "selectTab"; tabId: string }
  | { type: "renameTab"; tabId: string; title: string }
  | { type: "setLeafProfile"; tabId: string; leafId: string; profileId: string | null }
  | { type: "clearInitialCommand"; tabId: string; leafId: string }
  | { type: "splitActive"; direction: Direction }
  | { type: "closeActivePane" }
  | { type: "focusPane"; tabId: string; leafId: string }
  | { type: "navigate"; direction: "left" | "right" | "up" | "down" }
  | { type: "resizeSplit"; tabId: string; splitId: string; ratio: number };

const RATIO_MIN = 0.1;
const RATIO_MAX = 0.9;
let counter = 0;
const nextId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export const newLeaf = (
  profileId: string | null = null,
  initialCommand: string | null = null
): Leaf => ({
  kind: "leaf",
  id: nextId("pane"),
  profileId,
  initialCommand,
});

export const newTab = (
  title?: string,
  profileId: string | null = null,
  initialCommand: string | null = null
): Tab => {
  const root = newLeaf(profileId, initialCommand);
  return {
    id: nextId("tab"),
    title: title ?? "Shell",
    root,
    activeLeafId: root.id,
  };
};

export const initialLayout = (): LayoutState => {
  const tab = newTab();
  return { tabs: [tab], activeTabId: tab.id };
};

const findLeaf = (node: Node, id: string): Leaf | null => {
  if (node.kind === "leaf") return node.id === id ? node : null;
  return findLeaf(node.a, id) ?? findLeaf(node.b, id);
};

/** Public: locate a leaf inside a tab. Used by UI code that needs the
 *  active pane's profile id (TabBar dot, etc.). */
export const findLeafIn = (tab: Tab, leafId: string): Leaf | null => findLeaf(tab.root, leafId);

const collectLeaves = (node: Node, out: Leaf[] = []): Leaf[] => {
  if (node.kind === "leaf") {
    out.push(node);
  } else {
    collectLeaves(node.a, out);
    collectLeaves(node.b, out);
  }
  return out;
};

const replaceLeaf = (node: Node, leafId: string, replacement: Node): Node => {
  if (node.kind === "leaf") {
    return node.id === leafId ? replacement : node;
  }
  const a = replaceLeaf(node.a, leafId, replacement);
  const b = replaceLeaf(node.b, leafId, replacement);
  return a === node.a && b === node.b ? node : { ...node, a, b };
};

/** Apply `fn` to a leaf in-place (returning a new tree). Used for
 *  metadata edits like profile reassignment that don't change the shape. */
const mapLeaf = (node: Node, leafId: string, fn: (l: Leaf) => Leaf): Node => {
  if (node.kind === "leaf") return node.id === leafId ? fn(node) : node;
  const a = mapLeaf(node.a, leafId, fn);
  const b = mapLeaf(node.b, leafId, fn);
  return a === node.a && b === node.b ? node : { ...node, a, b };
};

// Remove `leafId` from the tree. If a split is left with one child, it
// collapses into that child. Returns `null` if the leaf was the entire tree.
const removeLeaf = (node: Node, leafId: string): Node | null => {
  if (node.kind === "leaf") {
    return node.id === leafId ? null : node;
  }
  const a = removeLeaf(node.a, leafId);
  const b = removeLeaf(node.b, leafId);
  if (a === null && b === null) return null;
  if (a === null) return b;
  if (b === null) return a;
  return a === node.a && b === node.b ? node : { ...node, a, b };
};

const findSplit = (node: Node, id: string): Split | null => {
  if (node.kind === "leaf") return null;
  if (node.id === id) return node;
  return findSplit(node.a, id) ?? findSplit(node.b, id);
};

const replaceSplit = (node: Node, splitId: string, replacement: Split): Node => {
  if (node.kind === "leaf") return node;
  if (node.id === splitId) return replacement;
  const a = replaceSplit(node.a, splitId, replacement);
  const b = replaceSplit(node.b, splitId, replacement);
  return a === node.a && b === node.b ? node : { ...node, a, b };
};

// Best-effort directional pane navigation: collect all leaves in a left-to-
// right, top-to-bottom traversal, find the active one, step ±1 within or
// across rows. Spatial navigation (true left/right) needs a geometry pass —
// scoped for a future iteration.
const stepLeaf = (root: Node, activeId: string, dir: "left" | "right" | "up" | "down"): string => {
  const leaves = collectLeaves(root);
  const idx = leaves.findIndex((l) => l.id === activeId);
  if (idx < 0) return activeId;
  const delta = dir === "left" || dir === "up" ? -1 : 1;
  const next = (idx + delta + leaves.length) % leaves.length;
  return leaves[next].id;
};

const updateTab = (state: LayoutState, tabId: string, fn: (t: Tab) => Tab): LayoutState => ({
  ...state,
  tabs: state.tabs.map((t) => (t.id === tabId ? fn(t) : t)),
});

export const layoutReducer = (state: LayoutState, action: LayoutAction): LayoutState => {
  switch (action.type) {
    case "newTab": {
      const tab = newTab(action.title, action.profileId ?? null, action.initialCommand ?? null);
      return { tabs: [...state.tabs, tab], activeTabId: tab.id };
    }

    case "closeTab": {
      const remaining = state.tabs.filter((t) => t.id !== action.tabId);
      if (remaining.length === 0) {
        const tab = newTab();
        return { tabs: [tab], activeTabId: tab.id };
      }
      const activeTabId =
        state.activeTabId === action.tabId ? remaining[remaining.length - 1].id : state.activeTabId;
      return { tabs: remaining, activeTabId };
    }

    case "selectTab":
      return { ...state, activeTabId: action.tabId };

    case "renameTab":
      return updateTab(state, action.tabId, (t) => ({ ...t, title: action.title }));

    case "setLeafProfile":
      return updateTab(state, action.tabId, (t) => ({
        ...t,
        root: mapLeaf(t.root, action.leafId, (l) => ({ ...l, profileId: action.profileId })),
      }));

    case "clearInitialCommand":
      return updateTab(state, action.tabId, (t) => ({
        ...t,
        root: mapLeaf(t.root, action.leafId, (l) => ({ ...l, initialCommand: null })),
      }));

    case "splitActive": {
      return updateTab(state, state.activeTabId, (t) => {
        // Inherit the source leaf's profile so a split keeps the same
        // accent (a "split prod" pane stays a prod pane).
        const source = findLeaf(t.root, t.activeLeafId);
        const newPane = newLeaf(source?.profileId ?? null);
        const split: Split = {
          kind: "split",
          id: nextId("split"),
          direction: action.direction,
          ratio: 0.5,
          a: source ?? { kind: "leaf", id: t.activeLeafId },
          b: newPane,
        };
        const root = replaceLeaf(t.root, t.activeLeafId, split);
        return { ...t, root, activeLeafId: newPane.id };
      });
    }

    case "closeActivePane": {
      return updateTab(state, state.activeTabId, (t) => {
        const next = removeLeaf(t.root, t.activeLeafId);
        if (next === null) {
          // Last pane closed → start a fresh leaf so the tab stays alive.
          const fresh = newLeaf();
          return { ...t, root: fresh, activeLeafId: fresh.id };
        }
        const leaves = collectLeaves(next);
        const fallback = leaves[0]?.id ?? t.activeLeafId;
        return { ...t, root: next, activeLeafId: fallback };
      });
    }

    case "focusPane":
      return updateTab(state, action.tabId, (t) =>
        findLeaf(t.root, action.leafId) ? { ...t, activeLeafId: action.leafId } : t
      );

    case "navigate": {
      return updateTab(state, state.activeTabId, (t) => ({
        ...t,
        activeLeafId: stepLeaf(t.root, t.activeLeafId, action.direction),
      }));
    }

    case "resizeSplit": {
      return updateTab(state, action.tabId, (t) => {
        const split = findSplit(t.root, action.splitId);
        if (!split) return t;
        const clamped = Math.min(RATIO_MAX, Math.max(RATIO_MIN, action.ratio));
        const updated: Split = { ...split, ratio: clamped };
        return { ...t, root: replaceSplit(t.root, action.splitId, updated) };
      });
    }
  }
};
