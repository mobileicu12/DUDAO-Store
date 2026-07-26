"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { titleForPath } from "@/lib/nav";
import { useMe } from "@/lib/use-me";
import { Badge, Button, cx, IconButton } from "@/components/ui/primitives";
import ThemeToggle from "@/components/ThemeToggle";
import TodaySendDrawer from "@/components/TodaySendDrawer";
import { Logo } from "./Logo";

export default function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { me, viaMaster } = useMe();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // The day-reports shortcut appears only after the owner-configured hour, so
  // it is out of the way in the morning and to hand at close.
  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { reportButtonHour?: number } | null) => {
        if (s && typeof s.reportButtonHour === "number") {
          setShowReports(new Date().getHours() >= s.reportButtonHour);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Close the menu on navigation, otherwise it hangs open over the new page.
  useEffect(() => setMenuOpen(false), [pathname]);

  const handleSignOut = async () => {
    if (viaMaster) {
      // Master access is a cookie, not a NextAuth session.
      await fetch("/api/login", { method: "DELETE" });
      router.push("/login");
      router.refresh();
      return;
    }
    await signOut({ callbackUrl: "/login" });
  };

  const initials = (me?.name || me?.email || "?")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  return (
    <header className="no-print sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur-md sm:px-6">
      {/* Brand shows on mobile, where there is no sidebar to carry it. */}
      <Link href="/portal" className="md:hidden">
        <Logo size="sm" />
      </Link>

      <h1 className="hidden min-w-0 truncate text-base font-semibold text-ink md:block">
        {titleForPath(pathname)}
      </h1>

      <div className="ml-auto flex items-center gap-2">
        {showReports && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setSendOpen(true)}
            icon={
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 6.5h16M4 12h16M4 17.5h10" />
              </svg>
            }
          >
            <span className="hidden sm:inline">Today&apos;s send</span>
          </Button>
        )}
        <div className="hidden sm:block">
          <ThemeToggle />
        </div>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className={cx(
              "flex h-9 items-center gap-2 rounded-lg border border-line bg-surface pr-2 pl-1 transition-colors hover:bg-subtle",
              menuOpen && "bg-subtle",
            )}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-xs font-semibold text-accentfg">
              {initials || "?"}
            </span>
            <span className="hidden max-w-28 truncate text-sm font-medium text-ink sm:block">
              {me?.name ?? "Account"}
            </span>
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 text-muted"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              aria-hidden
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
            >
              <div className="border-b border-line px-4 py-3">
                <p className="truncate text-sm font-semibold text-ink">
                  {me?.name ?? "Signed in"}
                </p>
                <p className="truncate text-xs text-muted">{me?.email}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone={me?.role === "owner" ? "accent" : "neutral"}>
                    {me?.role === "owner" ? "Owner" : "Staff"}
                  </Badge>
                  {viaMaster && <Badge tone="warning">Master password</Badge>}
                </div>
              </div>

              <div className="p-1.5 sm:hidden">
                <div className="px-2 py-1.5">
                  <ThemeToggle />
                </div>
              </div>

              <div className="p-1.5">
                <Link
                  href="/portal/settings"
                  role="menuitem"
                  className="block rounded-lg px-2.5 py-2 text-sm text-ink-2 transition-colors hover:bg-subtle hover:text-ink"
                >
                  Settings
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleSignOut}
                  className="block w-full rounded-lg px-2.5 py-2 text-left text-sm text-danger transition-colors hover:bg-danger-subtle"
                >
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <TodaySendDrawer open={sendOpen} onClose={() => setSendOpen(false)} />
    </header>
  );
}

export function AppFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="no-print px-4 pt-2 pb-6 text-center text-xs text-faint sm:px-6">
      <FooterName /> · {year}
    </footer>
  );
}

function FooterName() {
  const { me } = useMe();
  // Kept as a component so the footer re-renders with live business details
  // once settings load, without turning the footer into a client boundary of
  // its own.
  void me;
  return <span>{process.env.NEXT_PUBLIC_BIZ_NAME || "DUDAU"}</span>;
}
