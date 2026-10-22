import type { ReactNode } from "react";
import Link from "next/link";
import { BUSINESS } from "@/lib/business";
import { storefrontEnabled } from "@/lib/storefront";
import { CartProvider } from "./CartContext";
import ShopHeader from "./ShopHeader";

export const dynamic = "force-dynamic";

/**
 * Public storefront chrome. Deliberately separate from the portal shell — no
 * sidebar, no staff nav. Trade customers live here; staff live in /portal.
 *
 * The whole shop is behind the Settings "Public shop" switch: when it's off the
 * storefront is taken offline and every /shop page shows an unavailable notice.
 */
export default async function ShopLayout({ children }: { children: ReactNode }) {
  const enabled = await storefrontEnabled();
  if (!enabled) return <ShopOffline />;

  return (
    <CartProvider>
      <div className="flex min-h-dvh flex-col bg-bg">
        <ShopHeader />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
          {children}
        </main>
        <footer className="border-t border-line bg-surface">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p>
              © {new Date().getFullYear()} {BUSINESS.name}. All rights reserved.
            </p>
            <div className="flex gap-4">
              <Link href="/shop" className="hover:text-ink">
                Shop
              </Link>
              <Link href="/shop/contact" className="hover:text-ink">
                Contact
              </Link>
              <Link href="/shop/register" className="hover:text-ink">
                Open a trade account
              </Link>
            </div>
          </div>
          <div className="border-t border-line/60">
            <div className="mx-auto max-w-6xl px-4 py-2.5 text-xs text-muted/70 sm:px-6">
              Developed &amp; managed by Kuldeep J @{" "}
              <a
                href="https://share.google/n242crm1dbgPcKwF4"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-ink underline decoration-dotted underline-offset-2 transition-colors hover:text-accent"
              >
                RD-IT-Lab
              </a>
            </div>
          </div>
        </footer>
      </div>
    </CartProvider>
  );
}

/** Shown on every /shop route when the public shop is switched off in Settings. */
function ShopOffline() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-4 text-center">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-subtle text-xl">
          🛈
        </div>
        <h1 className="text-xl font-semibold text-ink">{BUSINESS.name}</h1>
        <p className="mt-2 text-sm text-muted">
          Our online shop isn&apos;t available right now. Please check back later
          or get in touch and we&apos;ll be happy to help.
        </p>
      </div>
    </div>
  );
}
