"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { groupedNav } from "@/lib/nav";
import { useMe } from "@/lib/use-me";
import { cx, Skeleton } from "@/components/ui/primitives";
import { Logo, NavIcon } from "./Logo";

const isActive = (pathname: string, href: string): boolean =>
  href === "/portal" ? pathname === "/portal" : pathname.startsWith(href);

/** Desktop-only. Mobile navigation is handled by MobileNav. */
export default function Sidebar() {
  const pathname = usePathname();
  const { me, loading } = useMe();
  const groups = groupedNav(me);

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface md:flex">
      <div className="flex h-16 items-center border-b border-line px-4">
        <Link
          href="/portal"
          className="min-w-0 rounded-lg transition-opacity hover:opacity-80"
        >
          <Logo />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {loading ? (
          <div className="space-y-2 px-1">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : (
          groups.map(({ group, items }) => (
            <div key={group} className="mb-5 last:mb-0">
              <p className="mb-1.5 px-2.5 text-[0.65rem] font-semibold tracking-wider text-faint uppercase">
                {group}
              </p>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cx(
                          "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                          active
                            ? "bg-accent-subtle text-accent"
                            : "text-ink-2 hover:bg-subtle hover:text-ink",
                        )}
                      >
                        {active && (
                          <span
                            className="absolute inset-y-1.5 -left-3 w-0.5 rounded-r-full bg-accent"
                            aria-hidden
                          />
                        )}
                        <NavIcon path={item.icon} />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </nav>
    </aside>
  );
}
