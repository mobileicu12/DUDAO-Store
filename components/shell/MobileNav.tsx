"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, visibleNav } from "@/lib/nav";
import { useMe } from "@/lib/use-me";
import { cx } from "@/components/ui/primitives";
import { Drawer } from "@/components/ui/Modal";
import { NavIcon } from "./Logo";

const isActive = (pathname: string, href: string): boolean =>
  href === "/portal" ? pathname === "/portal" : pathname.startsWith(href);

/**
 * Floating bottom bar. Everything on it sits in the lower third of the screen
 * because staff hold the phone one-handed while serving — a top nav on a
 * counter phone is unreachable without shuffling grip.
 */
export default function MobileNav() {
  const pathname = usePathname();
  const { me } = useMe();
  const [moreOpen, setMoreOpen] = useState(false);

  const all = visibleNav(NAV, me);
  const primary = all.filter((i) => i.primary).slice(0, 4);
  const rest = all.filter((i) => !primary.includes(i));

  if (all.length === 0) return null;

  return (
    <>
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 md:hidden">
        <div className="mx-3 mb-3 flex items-stretch gap-1 rounded-2xl border border-line bg-surface/95 p-1.5 shadow-pop backdrop-blur-md">
          {primary.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-[0.65rem] font-medium transition-colors",
                  active
                    ? "bg-accent-subtle text-accent"
                    : "text-muted active:bg-subtle",
                )}
              >
                <NavIcon path={item.icon} />
                <span className="truncate">{item.short ?? item.label}</span>
              </Link>
            );
          })}

          {rest.length > 0 && (
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className="flex flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-[0.65rem] font-medium text-muted transition-colors active:bg-subtle"
            >
              <NavIcon path="M5 12h.01M12 12h.01M19 12h.01" />
              <span>More</span>
            </button>
          )}
        </div>
      </nav>

      <Drawer
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="All sections"
        width="sm"
      >
        <ul className="space-y-1">
          {rest.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={cx(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-accent-subtle text-accent"
                      : "text-ink-2 active:bg-subtle",
                  )}
                >
                  <NavIcon path={item.icon} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </Drawer>
    </>
  );
}
