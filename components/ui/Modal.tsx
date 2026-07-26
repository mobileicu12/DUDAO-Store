"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cx, IconButton } from "./primitives";

const CloseIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    className="h-5 w-5"
    aria-hidden
  >
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

/** Escape-to-close plus body scroll lock, shared by Modal and Drawer. */
function useOverlayBehaviour(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
}

export type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

const SIZE: Record<ModalSize, string> = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
  full: "max-w-[min(96rem,95vw)]",
};

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  size = "md",
  footer,
  children,
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  size?: ModalSize;
  footer?: ReactNode;
  children: ReactNode;
  dismissable?: boolean;
}) {
  useOverlayBehaviour(open, () => dismissable && onClose());
  const panelRef = useRef<HTMLDivElement>(null);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <motion.div
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => dismissable && onClose()}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, y: 16, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.99 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className={cx(
              "relative flex max-h-[92dvh] w-full flex-col overflow-hidden bg-surface shadow-pop",
              "rounded-t-2xl sm:rounded-2xl",
              SIZE[size],
            )}
          >
            {(title || dismissable) && (
              <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
                <div className="min-w-0">
                  {title && (
                    <h2 className="truncate text-base font-semibold text-ink">
                      {title}
                    </h2>
                  )}
                  {subtitle && (
                    <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
                  )}
                </div>
                {dismissable && (
                  <IconButton label="Close" size="sm" onClick={onClose}>
                    {CloseIcon}
                  </IconButton>
                )}
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {children}
            </div>
            {footer && (
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/** Right-hand slide-over. Used for filters, today's send, and detail peeks. */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  width = "md",
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  width?: "sm" | "md" | "lg";
  footer?: ReactNode;
  children: ReactNode;
}) {
  useOverlayBehaviour(open, onClose);
  const w = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-2xl" }[width];

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className={cx(
              "absolute inset-y-0 right-0 flex w-full flex-col bg-surface shadow-pop",
              w,
            )}
          >
            <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div className="min-w-0">
                {title && (
                  <h2 className="truncate text-base font-semibold text-ink">
                    {title}
                  </h2>
                )}
                {subtitle && (
                  <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
                )}
              </div>
              <IconButton label="Close" size="sm" onClick={onClose}>
                {CloseIcon}
              </IconButton>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {children}
            </div>
            {footer && (
              <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3">
                {footer}
              </div>
            )}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}

/** Small confirm dialog — destructive actions never fire on a single click. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  tone = "danger",
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  busy?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      dismissable={!busy}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex h-10 items-center rounded-lg border border-line bg-subtle px-4 text-sm font-medium text-ink transition-colors hover:bg-surface disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={cx(
              "inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-white shadow-sm transition-all hover:brightness-110 disabled:opacity-50",
              tone === "danger" ? "bg-danger" : "bg-accent text-accentfg",
            )}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-ink-2">{message}</p>
    </Modal>
  );
}
