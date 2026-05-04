import { useEffect } from "react";
import { useLayout } from "../state/LayoutContext";

// Platform modifier: Cmd on macOS, Ctrl elsewhere. Per spec §5.5.1.
const isMac = navigator.platform.toLowerCase().includes("mac");
const mod = (e: KeyboardEvent) => (isMac ? e.metaKey : e.ctrlKey);

export function useShortcuts() {
  const { state, dispatch } = useLayout();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // New tab: Cmd/Ctrl+T
      if (mod(e) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        dispatch({ type: "newTab" });
        return;
      }
      // Close tab: Cmd/Ctrl+W
      if (mod(e) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "w") {
        e.preventDefault();
        dispatch({ type: "closeTab", tabId: state.activeTabId });
        return;
      }
      // Split right: Cmd/Ctrl+D
      if (mod(e) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        dispatch({ type: "splitActive", direction: "horizontal" });
        return;
      }
      // Split down: Cmd/Ctrl+Shift+D
      if (mod(e) && e.shiftKey && !e.altKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        dispatch({ type: "splitActive", direction: "vertical" });
        return;
      }
      // Close pane: Cmd/Ctrl+Shift+W
      if (mod(e) && e.shiftKey && !e.altKey && e.key.toLowerCase() === "w") {
        e.preventDefault();
        dispatch({ type: "closeActivePane" });
        return;
      }
      // Pane navigation: Cmd/Ctrl+Alt+Arrow
      if (mod(e) && e.altKey) {
        const dir =
          e.key === "ArrowLeft"
            ? "left"
            : e.key === "ArrowRight"
              ? "right"
              : e.key === "ArrowUp"
                ? "up"
                : e.key === "ArrowDown"
                  ? "down"
                  : null;
        if (dir) {
          e.preventDefault();
          dispatch({ type: "navigate", direction: dir });
          return;
        }
      }
      // Switch tab by index: Cmd/Ctrl+1..9
      if (mod(e) && !e.shiftKey && !e.altKey && /^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        const tab = state.tabs[idx];
        if (tab) {
          e.preventDefault();
          dispatch({ type: "selectTab", tabId: tab.id });
        }
      }
    };

    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [state.activeTabId, state.tabs, dispatch]);
}
