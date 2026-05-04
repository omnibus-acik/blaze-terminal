import { useLayout } from "../state/LayoutContext";

export function TabBar() {
  const { state, dispatch } = useLayout();
  return (
    <div className="tab-bar" role="tablist">
      {state.tabs.map((tab) => {
        const isActive = tab.id === state.activeTabId;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            tabIndex={0}
            className={`tab ${isActive ? "tab-active" : ""}`}
            onClick={() => dispatch({ type: "selectTab", tabId: tab.id })}
            onAuxClick={(e) => {
              if (e.button === 1) dispatch({ type: "closeTab", tabId: tab.id });
            }}
          >
            <span className="tab-title">{tab.title}</span>
            <button
              className="tab-close"
              aria-label={`close ${tab.title}`}
              onClick={(e) => {
                e.stopPropagation();
                dispatch({ type: "closeTab", tabId: tab.id });
              }}
            >
              ×
            </button>
          </div>
        );
      })}
      <button className="tab-new" aria-label="new tab" onClick={() => dispatch({ type: "newTab" })}>
        +
      </button>
    </div>
  );
}
