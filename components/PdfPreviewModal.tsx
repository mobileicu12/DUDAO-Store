"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/primitives";

/**
 * Inline PDF preview for documents DUDAO generates server-side (invoices,
 * statements, receipts). The PDF is streamed from its own route into an
 * iframe, so there is no client-side jsPDF bundle to ship and the preview is
 * byte-identical to what the customer will receive.
 *
 * Print drives the iframe where the browser allows it; New tab and Download are
 * always-reliable fallbacks (a same-origin `download` link forces a save even
 * though the route serves the PDF inline).
 */
export default function PdfPreviewModal({
  src,
  title,
  subtitle,
  filename,
  onClose,
}: {
  src: string;
  title: string;
  subtitle?: string;
  filename: string;
  onClose: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  function print() {
    const win = iframeRef.current?.contentWindow;
    if (win) {
      win.focus();
      win.print();
    }
  }

  const linkClass =
    "inline-flex h-9 items-center rounded-lg border border-line bg-subtle px-3 text-sm font-medium text-ink transition-colors hover:bg-surface";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-ink">{title}</h3>
            {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={print}>
              Print
            </Button>
            <a href={src} download={filename} className={linkClass}>
              Download
            </a>
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
            >
              New tab
            </a>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </header>
        <div className="flex-1 bg-subtle">
          <iframe
            ref={iframeRef}
            src={src}
            title={title}
            className="h-full w-full border-0"
          />
        </div>
      </div>
    </div>
  );
}
