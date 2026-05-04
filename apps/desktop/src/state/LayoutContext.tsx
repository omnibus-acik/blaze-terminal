import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from "react";
import { initialLayout, layoutReducer, type LayoutAction, type LayoutState } from "./layout";

interface Ctx {
  state: LayoutState;
  dispatch: Dispatch<LayoutAction>;
}

const LayoutCtx = createContext<Ctx | null>(null);

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(layoutReducer, undefined, initialLayout);
  return <LayoutCtx.Provider value={{ state, dispatch }}>{children}</LayoutCtx.Provider>;
}

export function useLayout(): Ctx {
  const ctx = useContext(LayoutCtx);
  if (!ctx) throw new Error("useLayout must be used inside <LayoutProvider>");
  return ctx;
}
