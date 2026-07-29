import type { ReactNode } from "react";
import Link from "next/link";
import { BUSINESS } from "@/lib/business";
import { CartProvider } from "./CartContext";
import ShopHeader from "./ShopHeader";

/**
 * Public storefront chrome. Deliberately separate from the portal shell — no
 * sidebar, no staff nav. Trade customers live here; staff live in /portal.
 */
export default function ShopLayout({ children }: { children: ReactNode }) {
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
