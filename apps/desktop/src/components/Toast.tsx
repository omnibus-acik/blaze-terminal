import { useEffect, useState } from "react";
import "./toast.css";

interface ToastState {
  id: number;
  text: string;
}

let counter = 0;
const listeners = new Set<(t: ToastState) => void>();

/** Fire-and-forget transient toast. Visible for ~1.4s. */
export function showToast(text: string): void {
  const t: ToastState = { id: ++counter, text };
  listeners.forEach((fn) => fn(t));
}

export function ToastHost() {
  const [toasts, setToasts] = useState<ToastState[]>([]);

  useEffect(() => {
    const onToast = (t: ToastState) => {
      setToasts((cur) => [...cur, t]);
      setTimeout(() => {
        setToasts((cur) => cur.filter((x) => x.id !== t.id));
      }, 1400);
    };
    listeners.add(onToast);
    return () => {
      listeners.delete(onToast);
    };
  }, []);

  return (
    <div className="toast-host" aria-live="polite" aria-atomic="true">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          {t.text}
        </div>
      ))}
    </div>
  );
}
