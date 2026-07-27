"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { money } from "@/lib/business";
import { useMe } from "@/lib/use-me";
import type { CatalogStats } from "@/app/api/stats/route";
import {
  Alert,
  Button,
  PageHeader,
  Skeleton,
  StatCard,
} from "@/components/ui/primitives";

type TodayTotals = {
  invoiced: number;
  paid: number;
  outstanding: number;
  invoiceCount: number;
  allTimeSales?: number;
};

const QUICK_LINKS: { href: string; label: string; body: string; icon: string }[] =
  [
    {
      href: "/portal/billing",
      label: "Open the till",
      body: "Start a new sale, scan a barcode and take payment.",
      icon: "M3.5 7.5h17l-1.2 11a1.5 1.5 0 0 1-1.5 1.35H6.2a1.5 1.5 0 0 1-1.5-1.35zM8.5 7.5V6a3.5 3.5 0 0 1 7 0v1.5",
    },
    {
      href: "/portal/invoices",
      label: "Invoices",
      body: "Find a bill, record a payment or send a copy.",
      icon: "M6.5 3.5h11a1 1 0 0 1 1 1v16l-3-2-2 2-2-2-2 2-3-2v-14a1 1 0 0 1 1-1zM9 8h6M9 12h6",
    },
    {
      href: "/portal/customers",
      label: "Customers",
      body: "Look up an account and check what is owed.",
      icon: "M15.5 8.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0zM4.5 20a7.5 7.5 0 0 1 15 0",
    },
    {
      href: "/portal/inventory",
      label: "Inventory",
      body: "Adjust stock, edit prices and print labels.",
      icon: "M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5zM3.5 7.5 12 12m0 0 8.5-4.5M12 12v9",
    },
  ];

export default function DashboardClient() {
  const { me, canSeeFinance, dbConfigured } = useMe();
  const [stats, setStats] = useState<CatalogStats | null>(null);
  const [today, setToday] = useState<TodayTotals | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      // Both panels load independently — a failure in one must not blank the
      // other, so each result is applied on its own.
      const [statsRes, todayRes] = await Promise.allSettled([
        fetch("/api/stats", { cache: "no-store" }),
        fetch("/api/reports/today", { cache: "no-store" }),
      ]);

      if (!alive) return;

      if (statsRes.status === "fulfilled" && statsRes.value.ok) {
        setStats((await statsRes.value.json()) as CatalogStats);
      }
      if (todayRes.status === "fulfilled" && todayRes.value.ok) {
        setToday((await todayRes.value.json()) as TodayTotals);
      }
      setLoading(false);
    };

    void run();
    return () => {
      alive = false;
    };
  }, []);

  const firstName = (me?.name ?? "").split(" ")[0];
  const invoiceCount = today?.invoiceCount ?? 0;

  return (
    <div>
      <PageHeader
        title={firstName ? `Hello, ${firstName}` : "Dashboard"}
        subtitle={new Date().toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
        actions={
          <Link href="/portal/billing">
            <Button variant="primary">New sale</Button>
          </Link>
        }
      />

      {!dbConfigured && (
        <div className="mb-5">
          <Alert tone="warning" title="The database is not connected yet">
            Products, customers and invoices all live in the database. Ask your
            developer to set DATABASE_URL, then reload this page.
          </Alert>
        </div>
      )}

      {/* Today's money — visible to every staff member. It is a single day's
          activity, not the shop's worth, so it sits outside the finance gate.
          The takings lead as a hero panel; the rest support it. */}
      <SectionLabel>Today&apos;s trading</SectionLabel>
      <section className="mb-7 grid gap-3 lg:grid-cols-3">
        <div className="relative overflow-hidden rounded-lg border border-accent/30 bg-surface p-5 shadow-sm">
          <span className="absolute inset-y-0 left-0 w-1 bg-accent" aria-hidden />
          <div className="flex items-center justify-between">
            <p className="text-[0.7rem] font-semibold tracking-wider text-muted uppercase">
              Taken today
            </p>
            <span className="rounded bg-accent-subtle px-1.5 py-0.5 text-[0.65rem] font-semibold tracking-wide text-accent uppercase">
              Live
            </span>
          </div>
          {loading ? (
            <Skeleton className="mt-3 h-11 w-40" />
          ) : (
            <p className="tnum mt-2 text-[2.6rem] leading-none font-semibold tracking-tight text-ink">
              {money(today?.paid ?? 0)}
            </p>
          )}
          <p className="mt-3 text-xs text-muted">
            {invoiceCount} invoice{invoiceCount === 1 ? "" : "s"} raised so far today
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:col-span-2">
          <StatCard
            label="Billed today"
            value={money(today?.invoiced ?? 0)}
            hint={
              today ? `${invoiceCount} invoice${invoiceCount === 1 ? "" : "s"}` : undefined
            }
            loading={loading}
          />
          <StatCard
            label="Outstanding"
            value={money(today?.outstanding ?? 0)}
            tone={today && today.outstanding > 0 ? "warning" : "neutral"}
            hint="Owed across all accounts"
            loading={loading}
          />
          {canSeeFinance ? (
            <StatCard
              label="All-time sales"
              value={money(today?.allTimeSales ?? 0)}
              tone="accent"
              loading={loading}
            />
          ) : (
            <StatCard
              label="Your access"
              value="Counter"
              hint="Ask the owner for reports access to see totals"
            />
          )}
          <StatCard
            label="Low stock"
            value={stats?.lowStock ?? 0}
            tone={stats && stats.lowStock > 0 ? "warning" : "neutral"}
            hint={stats ? `At or below ${stats.threshold}` : undefined}
            loading={loading}
          />
        </div>
      </section>

      <SectionLabel>Catalog</SectionLabel>
      <section className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Products"
          value={stats?.products ?? 0}
          tone="info"
          loading={loading}
        />
        <StatCard
          label="Low stock"
          value={stats?.lowStock ?? 0}
          tone={stats && stats.lowStock > 0 ? "warning" : "neutral"}
          loading={loading}
        />
        <StatCard
          label="Out of stock"
          value={stats?.outOfStock ?? 0}
          tone={stats && stats.outOfStock > 0 ? "danger" : "neutral"}
          loading={loading}
        />
        <StatCard
          label="Collections"
          value={stats?.collections ?? 0}
          loading={loading}
        />
      </section>

      <SectionLabel>Quick actions</SectionLabel>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {QUICK_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group flex items-center gap-3 rounded-lg border border-line bg-surface p-3.5 shadow-sm transition-colors hover:border-accent hover:bg-surface-2"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent-subtle text-accent transition-transform group-hover:scale-105">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.7}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden
              >
                <path d={link.icon} />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">
                {link.label}
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted">
                {link.body}
              </span>
            </span>
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="m9 6 6 6-6 6" />
            </svg>
          </Link>
        ))}
      </section>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2.5 text-[0.7rem] font-semibold tracking-[0.14em] text-faint uppercase">
      {children}
    </h2>
  );
}
