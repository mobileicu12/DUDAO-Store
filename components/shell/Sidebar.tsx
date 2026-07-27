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
          className="min-w-0 rounded-md transition-opacity hover:opacity-80"
        >
          <Logo />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 py-4">
        {loading ? (
          <div className="space-y-1.5 px-1">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : (
          groups.map(({ group, items }) => (
            <div key={group} className="mb-5 last:mb-0">
              <p className="mb-1.5 px-2.5 text-[0.65rem] font-semibold tracking-[0.12em] text-faint uppercase">
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
                          "group relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[0.8125rem] font-medium transition-colors",
                          active
                            ? "bg-accent-subtle text-accent"
                            : "text-ink-2 hover:bg-subtle hover:text-ink",
                        )}
                      >
                        <span
                          className={cx(
                            "absolute inset-y-1 left-0 w-[3px] rounded-r-full bg-accent transition-opacity",
                            active ? "opacity-100" : "opacity-0",
                          )}
                          aria-hidden
                        />
                        <NavIcon
                          path={item.icon}
                          className={cx("h-[1.15rem] w-[1.15rem]", !active && "text-faint group-hover:text-ink-2")}
                        />
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

      <div className="border-t border-line px-4 py-3">
        <p className="text-[0.65rem] font-medium tracking-wide text-faint uppercase">
          Trade counter portal
        </p>
      </div>
    </aside>
  );
}
