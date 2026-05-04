import { useEffect, useState } from "react";
import { LayoutProvider, useLayout } from "./state/LayoutContext";
import { SettingsProvider } from "./state/SettingsContext";
import { TabBar } from "./components/TabBar";
import { PaneTree } from "./components/PaneTree";
import { ShellIntegrationBanner } from "./components/ShellIntegrationBanner";
import { ToastHost } from "./components/Toast";
import { RunbookPicker } from "./components/RunbookPicker";
import { RunbookView } from "./components/RunbookView";
import type { RunbookSummary } from "./state/runbooks";
import { useShortcuts } from "./hooks/useShortcuts";
import "./components/layout.css";
import "./components/banner.css";
import "./App.css";

const isMac = navigator.platform.toLowerCase().includes("mac");

function Workspace() {
  const { state } = useLayout();
  useShortcuts();

  // Runbook UI is global: opening one takes over the tab-content area for
  // a dedicated split workspace (steps + own PTY). Tab bar stays usable.
  type RunbookView =
    | { stage: "closed" }
    | { stage: "picker" }
    | { stage: "view"; summary: RunbookSummary };
  const [runbookView, setRunbookView] = useState<RunbookView>({ stage: "closed" });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.shiftKey && !e.altKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        setRunbookView({ stage: "picker" });
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, []);

  const activeTab = state.tabs.find((t) => t.id === state.activeTabId);

  return (
    <div className="app">
      <ShellIntegrationBanner />
      <TabBar />
      <div className="tab-content">
        {runbookView.stage === "view" ? (
          <RunbookView
            summary={runbookView.summary}
            onClose={() => setRunbookView({ stage: "closed" })}
          />
        ) : (
          activeTab && (
            <PaneTree
              key={activeTab.id}
              node={activeTab.root}
              tabId={activeTab.id}
              activeLeafId={activeTab.activeLeafId}
            />
          )
        )}
      </div>
      {runbookView.stage === "picker" && (
        <RunbookPicker
          onSelect={(summary) => setRunbookView({ stage: "view", summary })}
          onClose={() => setRunbookView({ stage: "closed" })}
        />
      )}
      <ToastHost />
    </div>
  );
}

function App() {
  return (
    <SettingsProvider>
      <LayoutProvider>
        <Workspace />
      </LayoutProvider>
    </SettingsProvider>
  );
}

export default App;
