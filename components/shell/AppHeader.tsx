"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { titleForPath } from "@/lib/nav";
import { BUSINESS } from "@/lib/business";
import { useMe } from "@/lib/use-me";
import { Badge, cx } from "@/components/ui/primitives";
import ThemeToggle from "@/components/ThemeToggle";
import { useToast } from "@/components/ui/Toast";
import { Logo } from "./Logo";

export default function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { me, viaMaster } = useMe();
  const toast = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // "Today's reports" downloads one PDF per account customer billed today.
  const downloadReports = async () => {
    setZipBusy(true);
    try {
      const res = await fetch("/api/reports/today-zip");
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(b.error ?? "Could not build today's reports.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `customer-reports-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Could not build today's reports.");
    } finally {
      setZipBusy(false);
    }
  };

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

      <div className="hidden min-w-0 items-center gap-2 md:flex">
        <span className="shrink-0 text-sm font-semibold text-ink-2">
          {BUSINESS.name}
        </span>
        <span className="text-faint" aria-hidden>
          /
        </span>
        <h1 className="min-w-0 truncate text-sm font-semibold text-ink">
          {titleForPath(pathname)}
        </h1>
      </div>

      <div className="ml-auto flex items-center gap-2.5">
        {showReports && (
          <button
            type="button"
            onClick={downloadReports}
            disabled={zipBusy}
            title="Download one PDF per customer for today's sales (ZIP)"
            className="flex h-9 items-center gap-2 rounded-full bg-accent px-3.5 text-sm font-semibold text-accentfg transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 3.5v10m0 0 3.5-3.5M12 13.5 8.5 10M4.5 16v2.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V16" />
            </svg>
            <span className="hidden sm:inline">{zipBusy ? "Zipping…" : "Today's reports"}</span>
          </button>
        )}
        <span className="hidden items-center gap-1.5 text-xs font-medium text-muted sm:flex">
          <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
          Live
        </span>
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
              "flex h-9 items-center gap-2 rounded-md border border-line-strong bg-surface pr-2 pl-1 transition-colors hover:bg-subtle",
              menuOpen && "bg-subtle",
            )}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded bg-accent text-xs font-semibold text-accentfg">
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
              className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-lg border border-line bg-surface shadow-pop"
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
                  className="block rounded-md px-2.5 py-2 text-sm text-ink-2 transition-colors hover:bg-subtle hover:text-ink"
                >
                  Settings
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleSignOut}
                  className="block w-full rounded-md px-2.5 py-2 text-left text-sm text-danger transition-colors hover:bg-danger-subtle"
                >
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

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
