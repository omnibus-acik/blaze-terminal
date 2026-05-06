import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LayoutProvider, useLayout } from "./state/LayoutContext";
import { SettingsProvider } from "./state/SettingsContext";
import { TabBar } from "./components/TabBar";
import { PaneTree } from "./components/PaneTree";
import { ShellIntegrationBanner } from "./components/ShellIntegrationBanner";
import { ToastHost, showToast } from "./components/Toast";
import { RunbookPicker } from "./components/RunbookPicker";
import { RunbookView } from "./components/RunbookView";
import { SshHostsPicker } from "./components/SshHostsPicker";
import { TransferConfirmDialog } from "./components/TransferConfirmDialog";
import type { RunbookSummary } from "./state/runbooks";
import { TRANSFER_REQUEST_EVENT, type TransferRequest } from "./state/transfer";
import { useShortcuts } from "./hooks/useShortcuts";
import "./components/layout.css";
import "./components/banner.css";
import "./App.css";

const isMac = navigator.platform.toLowerCase().includes("mac");

function Workspace() {
  const { state, dispatch } = useLayout();
  useShortcuts();

  // Runbook UI is global: opening one takes over the tab-content area for
  // a dedicated split workspace (steps + own PTY). Tab bar stays usable.
  type RunbookView =
    | { stage: "closed" }
    | { stage: "picker" }
    | { stage: "view"; summary: RunbookSummary };
  const [runbookView, setRunbookView] = useState<RunbookView>({ stage: "closed" });
  const [transferRequest, setTransferRequest] = useState<TransferRequest | null>(null);
  const [sshPickerOpen, setSshPickerOpen] = useState(false);

  // Window-level event from Terminal.tsx drop handlers — open the confirm
  // dialog without prop-drilling state through the layout tree.
  useEffect(() => {
    const onTransfer = (e: WindowEventMap[typeof TRANSFER_REQUEST_EVENT]) => {
      setTransferRequest(e.detail);
    };
    window.addEventListener(TRANSFER_REQUEST_EVENT, onTransfer);
    return () => window.removeEventListener(TRANSFER_REQUEST_EVENT, onTransfer);
  }, []);

  const onTransferConfirm = async (command: string) => {
    if (!transferRequest) return;
    const target = transferRequest.destPaneId;
    setTransferRequest(null);
    try {
      await invoke("pty_write", { id: target, data: command + "\r" });
      showToast(`Copying to pane ${target.slice(0, 8)}…`);
    } catch (e) {
      console.error("pty_write failed:", e);
      showToast("Failed to start transfer");
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.shiftKey && !e.altKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        setRunbookView({ stage: "picker" });
      }
      // Cmd/Ctrl+Shift+H — SSH host picker. Layered alongside the other
      // global modal triggers so they share one keydown listener.
      if (mod && e.shiftKey && !e.altKey && e.key.toLowerCase() === "h") {
        e.preventDefault();
        setSshPickerOpen(true);
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, []);

  const activeTab = state.tabs.find((t) => t.id === state.activeTabId);

  return (
    <div className="app">
      <ShellIntegrationBanner />
      <TabBar onOpenSshPicker={() => setSshPickerOpen(true)} />
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
      {transferRequest && (
        <TransferConfirmDialog
          request={transferRequest}
          onConfirm={onTransferConfirm}
          onCancel={() => setTransferRequest(null)}
        />
      )}
      {sshPickerOpen && (
        <SshHostsPicker
          onConnect={(host) => {
            // Open a new tab whose pane runs `ssh <alias>` once the PTY
            // is ready. Title defaults to the alias so the tab is
            // identifiable at a glance.
            dispatch({
              type: "newTab",
              title: host.name,
              initialCommand: `ssh ${shellQuoteAlias(host.name)}`,
            });
            setSshPickerOpen(false);
          }}
          onClose={() => setSshPickerOpen(false)}
        />
      )}
      <ToastHost />
    </div>
  );
}

/** SSH host aliases are user-defined, so quote defensively before
 *  sending them through the shell. POSIX single-quote escape. */
function shellQuoteAlias(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
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
