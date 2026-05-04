import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { defaultSettings, loadSettings, type Settings } from "./settings";

const SettingsCtx = createContext<Settings>(defaultSettings());

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaultSettings());
  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);
  return <SettingsCtx.Provider value={settings}>{children}</SettingsCtx.Provider>;
}

export function useSettings(): Settings {
  return useContext(SettingsCtx);
}
