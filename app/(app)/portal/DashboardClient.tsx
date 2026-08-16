"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BUSINESS, money } from "@/lib/business";
import { useMe } from "@/lib/use-me";
import FinanceRequestButton from "@/components/FinanceRequestButton";
import type { CatalogStats } from "@/app/api/stats/route";
import {
  Alert,
  PageHeader,
  SectionLabel,
  Skeleton,
  StatCard,
  cx,
} from "@/components/ui/primitives";

type TodayTotals = {
  invoiced: number;
  paid: number;
  invoiceCount: number;
  retail: number;
  wholesale: number;
  cash: number;
  card: number;
  bank: number;
  collected: number;
  outstanding: number;
  latest: { number: string; name: string; total: number } | null;
  allTimeSales?: number;
};

const QUICK_LINKS: { href: string; label: string; body: string; icon: string }[] = [
  {
    href: "/portal/inventory",
    label: "Manage inventory",
    body: "Search, edit stock, bulk update.",
    icon: "M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5zM3.5 7.5 12 12m0 0 8.5-4.5M12 12v9",
  },
  {
    href: "/portal/products/new",
    label: "Add a product",
    body: "Create a product with all details.",
    icon: "M12 5v14M5 12h14",
  },
  {
    href: "/portal/import-export",
    label: "Import / Export",
    body: "Bulk add via Excel; export catalog.",
    icon: "M12 3.5v10m0 0 3.5-3.5M12 13.5 8.5 10M4.5 15.5v3a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-3",
  },
  {
    href: "/portal/billing",
    label: "New bill / invoice",
    body: "Wholesale invoice or POS sale.",
    icon: "M3.5 7.5h17l-1.2 11a1.5 1.5 0 0 1-1.5 1.35H6.2a1.5 1.5 0 0 1-1.5-1.35zM8.5 7.5V6a3.5 3.5 0 0 1 7 0v1.5",
  },
  {
    href: "/portal/invoices",
    label: "View invoices",
    body: "Past bills and orders.",
    icon: "M6.5 3.5h11a1 1 0 0 1 1 1v16l-3-2-2 2-2-2-2 2-3-2v-14a1 1 0 0 1 1-1zM9 8h6M9 12h6",
  },
];

type View = "all" | "cash" | "card";

export default function DashboardClient() {
  const { dbConfigured } = useMe();
  const [stats, setStats] = useState<CatalogStats | null>(null);
  const [today, setToday] = useState<TodayTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("all");

  useEffect(() => {
    let alive = true;
    const run = async () => {
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

  const headline =
    view === "cash" ? today?.cash : view === "card" ? today?.card : today?.invoiced;
  const headlineSub =
    view === "cash"
      ? "Cash payments today"
      : view === "card"
        ? "Card payments today"
        : "Retail + wholesale combined";

  const sales = today?.invoiceCount ?? 0;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`${BUSINESS.name} — control portal`}
        actions={<FinanceRequestButton />}
      />

      {!dbConfigured && (
        <div className="mb-5">
          <Alert tone="warning" title="The database is not connected yet">
            Products, customers and invoices all live in the database. Ask your
            developer to set DATABASE_URL, then reload this page.
          </Alert>
        </div>
      )}

      {/* Today's takings — dark hero, mirrors the counter's end-of-day view. */}
      <section className="mb-6 overflow-hidden rounded-xl border border-white/10 bg-[#0b1220] p-5 text-white shadow-lg sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[0.7rem] font-semibold tracking-[0.12em] text-[#f9a03a] uppercase">
              Today&apos;s takings · {sales} sale{sales === 1 ? "" : "s"}
            </p>
            {loading ? (
              <Skeleton className="mt-2 h-11 w-48 bg-white/10" />
            ) : (
              <p className="tnum mt-1 text-4xl font-bold tracking-tight sm:text-[2.75rem]">
                {money(headline ?? 0)}
              </p>
            )}
            <p className="mt-1 text-sm text-white/50">{headlineSub}</p>
          </div>

          <div className="inline-flex items-center gap-0.5 rounded-full bg-white/10 p-0.5">
            {(["all", "cash", "card"] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cx(
                  "rounded-full px-3 py-1 text-xs font-semibold capitalize transition-colors",
                  view === v ? "bg-[#f9a03a] text-[#231202]" : "text-white/70 hover:text-white",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <HeroTile label="Retail" value={money(today?.retail ?? 0)} loading={loading} />
          <HeroTile label="Wholesale" value={money(today?.wholesale ?? 0)} loading={loading} />
          <HeroTile label="Cash" value={money(today?.cash ?? 0)} loading={loading} />
          <HeroTile label="Card" value={money(today?.card ?? 0)} loading={loading} />
        </div>

        <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <HeroTile label="Collected today" value={money(today?.collected ?? 0)} loading={loading} />
          <HeroTile
            label="Total outstanding"
            value={money(today?.outstanding ?? 0)}
            tone="amber"
            loading={loading}
          />
        </div>

        {today?.latest && (
          <Link
            href="/portal/invoices"
            className="mt-2.5 flex items-center justify-between gap-3 rounded-lg bg-white/5 px-4 py-3 text-sm transition-colors hover:bg-white/10"
          >
            <span className="min-w-0 truncate text-white/70">
              Latest sale · <span className="font-semibold text-white">{today.latest.number}</span>
              {" · "}
              {today.latest.name}
            </span>
            <span className="tnum shrink-0 font-semibold text-[#f9a03a]">
              {money(today.latest.total)}
            </span>
          </Link>
        )}
      </section>

      {/* Catalog stats */}
      <section className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total products" value={stats?.products ?? 0} loading={loading} />
        <StatCard
          label={`Low stock (≤${stats?.threshold ?? 5})`}
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
        <StatCard label="Collections" value={stats?.collections ?? 0} loading={loading} />
      </section>

      <SectionLabel>Quick actions</SectionLabel>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {QUICK_LINKS.map((link) => (
          <Link
            key={link.href + link.label}
            href={link.href}
            className="group flex items-start gap-3 rounded-lg border border-line bg-surface p-4 shadow-sm transition-colors hover:border-accent hover:bg-surface-2"
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
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">{link.label}</span>
              <span className="mt-0.5 block text-xs text-muted">{link.body}</span>
            </span>
          </Link>
        ))}
      </section>
    </div>
  );
}

function HeroTile({
  label,
  value,
  tone = "plain",
  loading = false,
}: {
  label: string;
  value: string;
  tone?: "plain" | "amber";
  loading?: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3.5 py-3">
      <p className="text-[0.65rem] font-medium tracking-wider text-white/45 uppercase">
        {label}
      </p>
      {loading ? (
        <Skeleton className="mt-1.5 h-6 w-20 bg-white/10" />
      ) : (
        <p
          className={cx(
            "tnum mt-1 text-lg font-semibold tracking-tight",
            tone === "amber" ? "text-[#f9a03a]" : "text-white",
          )}
        >
          {value}
        </p>
      )}
    </div>
  );
}
