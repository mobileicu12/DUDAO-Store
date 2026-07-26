"use client";

import { useEffect } from "react";

/**
 * Applies a custom favicon at runtime from settings.
 *
 * The favicon URL is owner-configurable and stored in the database, so it
 * cannot be baked into the static <head>. This swaps the <link rel="icon"> once
 * settings load. Kept tiny and effect-only — it renders nothing.
 */
export default function FaviconManager() {
  useEffect(() => {
    let cancelled = false;

    fetch("/api/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { faviconUrl?: string } | null) => {
        if (cancelled || !s?.faviconUrl) return;
        let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
        if (!link) {
          link = document.createElement("link");
          link.rel = "icon";
          document.head.appendChild(link);
        }
        link.href = s.faviconUrl;
      })
      .catch(() => {
        // A missing favicon is cosmetic; never surface it.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
