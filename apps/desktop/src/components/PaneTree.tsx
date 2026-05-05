import { useRef } from "react";
import type { Node } from "../state/layout";
import { useLayout } from "../state/LayoutContext";
import { useSettings } from "../state/SettingsContext";
import { effectiveProfile } from "../state/profiles";
import { Terminal } from "../Terminal";
import { Splitter } from "./Splitter";

interface PaneTreeProps {
  node: Node;
  tabId: string;
  activeLeafId: string;
}

export function PaneTree({ node, tabId, activeLeafId }: PaneTreeProps) {
  const { dispatch } = useLayout();
  const settings = useSettings();

  if (node.kind === "leaf") {
    const isActive = node.id === activeLeafId;
    const profile = effectiveProfile(settings, node.profileId ?? null);
    // Profile accent overrides the default blue active-pane border so
    // prod/stage panes are visually distinct even when focused.
    const activeStyle = isActive && profile?.color ? { borderColor: profile.color } : undefined;
    return (
      <div
        className={`pane ${isActive ? "pane-active" : ""}`}
        style={activeStyle}
        onPointerDown={() => {
          if (!isActive) dispatch({ type: "focusPane", tabId, leafId: node.id });
        }}
      >
        <Terminal sessionId={node.id} active={isActive} profileId={node.profileId ?? null} />
      </div>
    );
  }

  return <SplitNode node={node} tabId={tabId} activeLeafId={activeLeafId} />;
}

function SplitNode({
  node,
  tabId,
  activeLeafId,
}: PaneTreeProps & { node: Extract<Node, { kind: "split" }> }) {
  const { dispatch } = useLayout();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const aFlex = node.ratio;
  const bFlex = 1 - node.ratio;

  return (
    <div
      ref={containerRef}
      className={`split split-${node.direction}`}
      style={{ flexDirection: node.direction === "horizontal" ? "row" : "column" }}
    >
      <div className="split-child" style={{ flex: aFlex }}>
        <PaneTree node={node.a} tabId={tabId} activeLeafId={activeLeafId} />
      </div>
      <Splitter
        direction={node.direction}
        containerRef={containerRef}
        onResize={(ratio) => dispatch({ type: "resizeSplit", tabId, splitId: node.id, ratio })}
      />
      <div className="split-child" style={{ flex: bFlex }}>
        <PaneTree node={node.b} tabId={tabId} activeLeafId={activeLeafId} />
      </div>
    </div>
  );
}
