import { useEffect, useRef, useState } from "react";
import { useLayout } from "../state/LayoutContext";
import { useSettings } from "../state/SettingsContext";
import { findLeafIn } from "../state/layout";
import { effectiveProfile } from "../state/profiles";
import type { Profile } from "../state/settings";

/**
 * Tab bar with three new affordances on top of select/close:
 *
 * - **Dot**: each tab shows a small colour dot for the active leaf's
 *   profile, so prod / stage / dev are obvious at a glance.
 * - **Rename**: double-click the title to edit. Enter saves; Esc reverts.
 * - **Profile picker**: a chevron next to the `+` button opens a menu of
 *   profiles for "new tab as…" — clicking `+` directly creates a tab
 *   with the default profile.
 */
export function TabBar() {
  const { state, dispatch } = useLayout();
  const settings = useSettings();
  const [pickerOpen, setPickerOpen] = useState(false);
  const newWrapperRef = useRef<HTMLDivElement | null>(null);

  // Click-outside closes the picker. Capture-phase so it triggers before
  // a click that selects a profile gets eaten by the menu items.
  useEffect(() => {
    if (!pickerOpen) return;
    const onDocPointer = (e: PointerEvent) => {
      if (!newWrapperRef.current?.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    window.addEventListener("pointerdown", onDocPointer, true);
    return () => window.removeEventListener("pointerdown", onDocPointer, true);
  }, [pickerOpen]);

  return (
    <div className="tab-bar" role="tablist">
      {state.tabs.map((tab) => {
        const isActive = tab.id === state.activeTabId;
        const leaf = findLeafIn(tab, tab.activeLeafId);
        const profile = effectiveProfile(settings, leaf?.profileId ?? null);
        return (
          <TabItem
            key={tab.id}
            id={tab.id}
            title={tab.title}
            isActive={isActive}
            profile={profile}
            onSelect={() => dispatch({ type: "selectTab", tabId: tab.id })}
            onRename={(title) => dispatch({ type: "renameTab", tabId: tab.id, title })}
            onClose={() => dispatch({ type: "closeTab", tabId: tab.id })}
          />
        );
      })}
      <div className="tab-new-wrapper" ref={newWrapperRef}>
        <button
          className="tab-new"
          aria-label="new tab"
          onClick={() => dispatch({ type: "newTab" })}
          title="New tab (default profile)"
        >
          +
        </button>
        <button
          className="tab-new-caret"
          aria-label="choose profile for new tab"
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen((v) => !v)}
          title="New tab with profile…"
        >
          ▾
        </button>
        {pickerOpen && (
          <div className="tab-profile-menu" role="menu">
            <div className="tab-profile-menu-label">New tab as…</div>
            {settings.profiles.map((p) => (
              <button
                key={p.id}
                role="menuitem"
                className="tab-profile-menu-row"
                onClick={() => {
                  dispatch({ type: "newTab", profileId: p.id });
                  setPickerOpen(false);
                }}
              >
                <span
                  className="tab-profile-dot"
                  style={p.color ? { backgroundColor: p.color } : undefined}
                />
                <span className="tab-profile-menu-name">{p.name}</span>
                <span className="tab-profile-menu-id">{p.id}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface TabItemProps {
  id: string;
  title: string;
  isActive: boolean;
  profile: Profile | null;
  onSelect: () => void;
  onRename: (title: string) => void;
  onClose: () => void;
}

function TabItem({ id, title, isActive, profile, onSelect, onRename, onClose }: TabItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) {
      // Defer focus + select so the input has mounted and the click that
      // opened edit mode doesn't immediately blur it.
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing]);

  // Keep draft in sync if title changes externally while not editing.
  useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== title) onRename(next);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(title);
    setEditing(false);
  };

  // Profile colour is rendered as a small dot before the title, plus a
  // 2px left bar on the active tab so the accent reads even in the
  // inactive-tab grey.
  const accent = profile?.color ?? null;

  return (
    <div
      key={id}
      role="tab"
      aria-selected={isActive}
      tabIndex={0}
      className={`tab ${isActive ? "tab-active" : ""}`}
      style={isActive && accent ? { boxShadow: `inset 2px 0 0 0 ${accent}` } : undefined}
      onClick={() => {
        if (!editing) onSelect();
      }}
      onAuxClick={(e) => {
        if (e.button === 1) onClose();
      }}
    >
      <span
        className="tab-profile-dot"
        style={accent ? { backgroundColor: accent } : undefined}
        title={profile ? `${profile.name} (${profile.id})` : "Default profile"}
      />
      {editing ? (
        <input
          ref={inputRef}
          className="tab-title-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          // Clicks inside the input mustn't bubble into the tab's onClick
          // (which would re-focus and lose the selection).
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          className="tab-title"
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          title="Double-click to rename"
        >
          {title}
        </span>
      )}
      <button
        className="tab-close"
        aria-label={`close ${title}`}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        ×
      </button>
    </div>
  );
}
