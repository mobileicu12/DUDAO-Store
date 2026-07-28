"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { money } from "@/lib/business";
import { STATUS_LABEL, type InvoiceStatus } from "@/lib/billing-shared";
import { SEGMENTS, segmentDef } from "@/lib/segments";
import type { InvoiceRecord } from "@/lib/billing";
import { useCanSeeFinance } from "@/lib/use-me";
import {
  ColumnChooser,
  useColumns,
  type ColumnDef,
} from "@/components/ColumnChooser";
import {
  Badge,
  Button,
  cx,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Skeleton,
  type Tone,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

type ColKey =
  | "number"
  | "customer"
  | "segment"
  | "staff"
  | "status"
  | "date"
  | "total"
  | "balance";

const COLUMNS: ColumnDef<ColKey>[] = [
  { key: "number", label: "Invoice", locked: true },
  { key: "customer", label: "Customer" },
  { key: "segment", label: "Source" },
  { key: "staff", label: "Staff" },
  { key: "date", label: "Date" },
  { key: "status", label: "Status" },
  { key: "total", label: "Total", numeric: true },
  { key: "balance", label: "Balance", numeric: true, locked: true },
];

const STATUS_TONE: Record<InvoiceStatus, Tone> = {
  PAID: "success",
  UNPAID: "warning",
  DRAFT: "neutral",
  VOID: "danger",
};

export default function InvoicesClient() {
  const toast = useToast();
  const canSeeFinance = useCanSeeFinance();

  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [segment, setSegment] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { visible, hidden, toggle, reset } = useColumns("invoices", COLUMNS, [
    "staff",
  ]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchPage = useCallback(
    async (nextCursor: string | null) => {
      const params = new URLSearchParams({ limit: "50", status, segment });
      if (debounced.trim()) params.set("q", debounced.trim());
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (nextCursor) params.set("cursor", nextCursor);

      const res = await fetch(`/api/billing?${params}`, { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Could not load your invoices.");
      }
      return (await res.json()) as {
        invoices: InvoiceRecord[];
        nextCursor: string | null;
        total: number;
      };
    },
    [debounced, status, segment, from, to],
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchPage(null)
      .then((d) => {
        if (!alive) return;
        setInvoices(d.invoices);
        setCursor(d.nextCursor);
        setTotal(d.total);
      })
      .catch((e: Error) => alive && toast.error(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [fetchPage, toast]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const d = await fetchPage(cursor);
      setInvoices((prev) => [...prev, ...d.invoices]);
      setCursor(d.nextCursor);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  const exportCsv = () => {
    // Built client-side from what is on screen — no round trip, and it exports
    // exactly the filtered set staff are looking at.
    const rows = [
      ["Invoice", "Date", "Customer", "Source", "Staff", "Status", "Total", "Paid", "Balance"],
      ...invoices.map((i) => [
        i.number,
        new Date(i.issuedAt).toLocaleDateString("en-GB"),
        i.customer?.name || i.walkInName || "Walk-in",
        segmentDef(i.segment)?.label ?? i.segment,
        i.staffName,
        STATUS_LABEL[i.status],
        i.totals.total.toFixed(2),
        i.totals.paid.toFixed(2),
        i.totals.balance.toFixed(2),
      ]),
    ];
    const csv = rows
      .map((r) =>
        r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");

    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isVisible = (k: ColKey) => visible.some((v) => v.key === k);

  const outstanding = invoices.reduce((s, i) => s + i.totals.balance, 0);

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle={loading ? "Loading…" : `${total.toLocaleString()} invoice${total === 1 ? "" : "s"}`}
        actions={
          <>
            <Button onClick={exportCsv} disabled={invoices.length === 0}>
              Export CSV
            </Button>
            <Link href="/portal/billing">
              <Button variant="primary">New sale</Button>
            </Link>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Invoice number or customer"
          className="h-9 w-full sm:w-56"
          aria-label="Search invoices"
        />
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-9 w-auto"
          aria-label="Status"
        >
          <option value="all">All statuses</option>
          <option value="open">Open (unpaid)</option>
          <option value="PAID">Paid</option>
          <option value="VOID">Void</option>
        </Select>
        <Select
          value={segment}
          onChange={(e) => setSegment(e.target.value)}
          className="h-9 w-auto"
          aria-label="Source"
        >
          <option value="all">All sources</option>
          {SEGMENTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="h-9 w-auto"
          aria-label="From date"
        />
        <Input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="h-9 w-auto"
          aria-label="To date"
        />
        <div className="ml-auto">
          <ColumnChooser
            defs={COLUMNS}
            hidden={hidden}
            onToggle={toggle}
            onReset={reset}
          />
        </div>
      </div>

      {/* Outstanding across the filtered set is safe for all staff — it is a
          debt figure, not turnover. */}
      {!loading && invoices.length > 0 && (
        <p className="mb-3 text-sm text-muted">
          Showing {invoices.length} of {total}
          {outstanding > 0 && (
            <>
              {" · "}
              <span className="font-medium text-warning">
                {money(outstanding)} outstanding
              </span>
            </>
          )}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] border-collapse text-sm">
            <thead className="border-b border-line bg-subtle">
              <tr>
                {visible.map((d) => (
                  <th
                    key={d.key}
                    scope="col"
                    className={cx(
                      "px-3 py-2.5 text-xs font-semibold text-ink-2",
                      d.numeric ? "text-right" : "text-left",
                    )}
                  >
                    {d.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td colSpan={visible.length} className="px-3 py-3">
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={visible.length}>
                    <EmptyState
                      title="No invoices here"
                      message="Nothing matches these filters yet. Take a sale at the till and it will appear."
                      action={
                        <Link href="/portal/billing">
                          <Button variant="primary">Open the till</Button>
                        </Link>
                      }
                    />
                  </td>
                </tr>
              ) : (
                invoices.map((i) => {
                  const seg = segmentDef(i.segment);
                  return (
                    <tr
                      key={i.id}
                      className="border-b border-line transition-colors last:border-0 hover:bg-subtle/60"
                    >
                      {isVisible("number") && (
                        <td className="px-3 py-2.5">
                          <Link
                            href={`/portal/invoices/${i.id}`}
                            className="font-medium text-ink hover:text-accent"
                          >
                            {i.number}
                          </Link>
                        </td>
                      )}
                      {isVisible("customer") && (
                        <td className="px-3 py-2.5">
                          <span className="block truncate text-ink-2">
                            {i.customer?.name || i.walkInName || "Walk-in"}
                          </span>
                        </td>
                      )}
                      {isVisible("segment") && (
                        <td className="px-3 py-2.5">
                          {seg && (
                            <span
                              className={cx(
                                "inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
                                seg.badge,
                              )}
                            >
                              {seg.short}
                            </span>
                          )}
                        </td>
                      )}
                      {isVisible("staff") && (
                        <td className="px-3 py-2.5 text-muted">
                          {i.staffName || "—"}
                        </td>
                      )}
                      {isVisible("date") && (
                        <td className="px-3 py-2.5 text-muted">
                          {new Date(i.issuedAt).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                          })}
                        </td>
                      )}
                      {isVisible("status") && (
                        <td className="px-3 py-2.5">
                          <Badge tone={STATUS_TONE[i.status]} dot>
                            {STATUS_LABEL[i.status]}
                          </Badge>
                        </td>
                      )}
                      {isVisible("total") && (
                        <td className="tnum px-3 py-2.5 text-right text-ink">
                          {money(i.totals.total)}
                        </td>
                      )}
                      {isVisible("balance") && (
                        <td className="tnum px-3 py-2.5 text-right">
                          <span
                            className={cx(
                              "font-medium",
                              i.totals.balance > 0 ? "text-warning" : "text-muted",
                            )}
                          >
                            {money(i.totals.balance)}
                          </span>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {cursor && (
          <div className="border-t border-line p-3 text-center">
            <Button variant="secondary" loading={loadingMore} onClick={loadMore}>
              Load more
            </Button>
          </div>
        )}
      </div>

      {!canSeeFinance && !loading && invoices.length > 0 && (
        <p className="mt-3 text-xs text-faint">
          Totals shown are for the invoices listed here. Business-wide sales
          reporting needs the reports permission.
        </p>
      )}
    </div>
  );
}
