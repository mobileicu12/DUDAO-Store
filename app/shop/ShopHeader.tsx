"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BUSINESS, businessMark } from "@/lib/business";
import { cx } from "@/components/ui/primitives";
import { useCart } from "./CartContext";

type Me = { id: string; name: string; company: string } | null;

export default function ShopHeader() {
  const { count } = useCart();
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/shop/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { customer: null }))
      .then((d: { customer: Me }) => alive && setMe(d.customer))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pathname]);

  const logout = async () => {
    await fetch("/api/shop/login", { method: "DELETE" });
    setMe(null);
    router.push("/shop");
    router.refresh();
  };

  const link = (href: string, label: string) => {
    const active = href === "/shop" ? pathname === "/shop" : pathname.startsWith(href);
    return (
      <Link
        href={href}
        className={cx(
          "text-sm font-medium transition-colors",
          active ? "text-accent" : "text-ink-2 hover:text-ink",
        )}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/shop" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-xs font-bold text-accentfg">
            {businessMark(BUSINESS.name)}
          </span>
          <span className="text-[0.95rem] font-semibold tracking-tight text-ink">
            {BUSINESS.name}
          </span>
        </Link>

        <nav className="ml-4 hidden items-center gap-5 sm:flex">
          {link("/shop", "Shop")}
          {link("/shop/contact", "Contact")}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <Link
            href="/shop/cart"
            className="relative flex h-9 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-subtle"
            aria-label={`Basket, ${count} item${count === 1 ? "" : "s"}`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3.5 7.5h17l-1.2 11a1.5 1.5 0 0 1-1.5 1.35H6.2a1.5 1.5 0 0 1-1.5-1.35zM8.5 7.5V6a3.5 3.5 0 0 1 7 0v1.5" />
            </svg>
            <span className="hidden sm:inline">Basket</span>
            {count > 0 && (
              <span className="tnum absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[0.65rem] font-semibold text-accentfg">
                {count}
              </span>
            )}
          </Link>

          {me ? (
            <div className="flex items-center gap-2">
              <Link
                href="/shop/account"
                className="hidden max-w-32 truncate text-sm font-medium text-ink-2 hover:text-ink sm:block"
                title={me.company || me.name}
              >
                {me.company || me.name}
              </Link>
              <button
                type="button"
                onClick={logout}
                className="text-sm font-medium text-muted transition-colors hover:text-ink"
              >
                Log out
              </button>
            </div>
          ) : (
            <Link
              href="/shop/trade-login"
              className="flex h-9 items-center rounded-md bg-accent px-3.5 text-sm font-semibold text-accentfg transition-colors hover:bg-accent-hover"
            >
              Trade login
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
