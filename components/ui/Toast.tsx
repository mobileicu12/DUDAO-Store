"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cx } from "./primitives";

type ToastTone = "success" | "error" | "info";

type Toast = {
  id: number;
  tone: ToastTone;
  message: string;
  detail?: string;
};

type ToastApi = {
  success: (message: string, detail?: string) => void;
  error: (message: string, detail?: string) => void;
  info: (message: string, detail?: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Toasts are how every mutation reports back. Errors stay up twice as long as
 * successes because staff need time to read what went wrong mid-sale.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((tone: ToastTone, message: string, detail?: string) => {
    const id = nextId.current++;
    setToasts((list) => [...list, { id, tone, message, detail }]);
    const ttl = tone === "error" ? 7000 : 3500;
    setTimeout(() => {
      setToasts((list) => list.filter((t) => t.id !== id));
    }, ttl);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (m, d) => push("success", m, d),
      error: (m, d) => push("error", m, d),
      info: (m, d) => push("info", m, d),
    }),
    [push],
  );

  const dismiss = (id: number) =>
    setToasts((list) => list.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-24 sm:inset-x-auto sm:right-4 sm:items-end sm:pb-4"
        aria-live="polite"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              onClick={() => dismiss(t.id)}
              className={cx(
                "pointer-events-auto w-full max-w-sm cursor-pointer rounded-xl border bg-surface px-4 py-3 shadow-lg",
                t.tone === "success" && "border-l-4 border-l-success border-line",
                t.tone === "error" && "border-l-4 border-l-danger border-line",
                t.tone === "info" && "border-l-4 border-l-info border-line",
              )}
            >
              <p className="text-sm font-medium text-ink">{t.message}</p>
              {t.detail && (
                <p className="mt-0.5 text-xs text-muted">{t.detail}</p>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return ctx;
}
