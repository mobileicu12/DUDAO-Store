"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Modal } from "@/components/ui/Modal";
import { Alert } from "@/components/ui/primitives";

/**
 * Camera barcode scanner.
 *
 * De-duplicates repeat reads inside a short window: a barcode held in front of
 * the lens decodes many times a second, and without this a single scan would
 * add ten of the same item to the cart.
 *
 * The parent decides whether to keep scanning — at the till you want to keep
 * going, in inventory you want to jump to the product and stop.
 */
export default function BarcodeScanner({
  open,
  onClose,
  onDetected,
  title = "Scan a barcode",
}: {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
  title?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const lastRead = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    let stopFn: (() => void) | null = null;
    const reader = new BrowserMultiFormatReader();

    const start = async () => {
      setError(null);
      setReady(false);

      try {
        const controls = await reader.decodeFromConstraints(
          // Rear camera where there is one; falls back to whatever exists.
          { video: { facingMode: { ideal: "environment" } } },
          videoRef.current!,
          (result) => {
            if (cancelled || !result) return;
            const code = result.getText().trim();
            if (!code) return;

            const now = Date.now();
            if (
              lastRead.current.code === code &&
              now - lastRead.current.at < 1500
            ) {
              return;
            }
            lastRead.current = { code, at: now };
            onDetected(code);
          },
        );

        stopFn = () => controls.stop();
        if (!cancelled) setReady(true);
      } catch (err) {
        if (cancelled) return;
        const name = (err as Error)?.name ?? "";
        setError(
          name === "NotAllowedError"
            ? "Camera access was blocked. Allow the camera in your browser settings, then try again."
            : name === "NotFoundError"
              ? "No camera was found on this device. You can type the barcode into the search box instead."
              : "The camera could not be started. You can type the barcode into the search box instead.",
        );
      }
    };

    void start();

    return () => {
      cancelled = true;
      // Release the camera. Without this the light stays on and the next open
      // fails with the device already in use.
      stopFn?.();
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, onDetected]);

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      {error ? (
        <Alert tone="danger">{error}</Alert>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-xl bg-black">
            <video
              ref={videoRef}
              className="aspect-[4/3] w-full object-cover"
              muted
              playsInline
            />
            <div
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
              aria-hidden
            >
              <div className="h-24 w-4/5 rounded-lg border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
          </div>
          <p className="mt-3 text-center text-sm text-muted">
            {ready
              ? "Hold the barcode inside the box."
              : "Starting the camera…"}
          </p>
        </>
      )}
    </Modal>
  );
}
