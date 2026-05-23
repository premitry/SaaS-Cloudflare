"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

type ToastKind = "success" | "error" | "info";
type Toast = { id: number; kind: ToastKind; message: string };

type Ctx = {
  push: (kind: ToastKind, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastCtx = createContext<Ctx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const ctx: Ctx = {
    push,
    success: (m) => push("success", m),
    error: (m) => push("error", m),
    info: (m) => push("info", m),
  };
  return (
    <ToastCtx.Provider value={ctx}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`min-w-[260px] max-w-[420px] rounded-lg px-4 py-3 text-sm shadow-card border
              ${
                t.kind === "success"
                  ? "bg-emerald-900/40 border-emerald-700/50 text-emerald-200"
                  : t.kind === "error"
                  ? "bg-red-900/40 border-red-700/50 text-red-200"
                  : "bg-ink-800 border-ink-700 text-ink-200"
              }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast(): Ctx {
  const ctx = useContext(ToastCtx);
  if (!ctx) {
    // safe no-op fallback so components can render outside provider
    return {
      push: () => {},
      success: () => {},
      error: () => {},
      info: () => {},
    };
  }
  return ctx;
}

// fire-and-forget helper for components that don't have access to context
let lastPush: ((kind: ToastKind, message: string) => void) | null = null;
export function bindToastSink(p: (kind: ToastKind, message: string) => void) {
  lastPush = p;
}
export function toast(kind: ToastKind, message: string) {
  lastPush?.(kind, message);
}

// Effect helper to bind sink from inside a tree (consumers can mount this once)
export function ToastBinder() {
  const t = useToast();
  useEffect(() => {
    bindToastSink(t.push);
  }, [t]);
  return null;
}
