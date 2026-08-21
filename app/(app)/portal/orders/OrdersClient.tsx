"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { money } from "@/lib/business";
import { STATUS_LABEL, type InvoiceStatus } from "@/lib/billing-shared";
import { SEGMENTS, segmentDef } from "@/lib/segments";
import type { InvoiceRecord } from "@/lib/billing";
import {
  Badge,
  Button,
  cx,
  EmptyState,
  Input,
  PageHeader,
  Segmented,
  Skeleton,
  type Tone,
} from "@/components/ui/primitives";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";

/**
 * Orders = completed (paid) invoices, viewed by channel.
 *
 * Without a separate marketplace order feed, a paid invoice IS the order —
 * whether it was rung up at the counter or came from eBay. This page is the
 * fulfilment-and-channel lens on the same data the invoices page lists, filtered
 * to PAID by default and grouped by source segment.
 */
const STATUS_TONE: Record<InvoiceStatus, Tone> = {
  PAID: "success",
  UNPAID: "warning",
  DRAFT: "neutral",
  VOID: "danger",
};

export default function OrdersClient() {
  const toast = useToast();
  const [orders, setOrders] = useState<InvoiceRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [segment, setSegment] = useState("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchPage = useCallback(
    async (next: string | null) => {
      const params = new URLSearchParams({ limit: "200", status: "PAID", segment });
      if (debounced.trim()) params.set("q", debounced.trim());
      if (next) params.set("cursor", next);
      const res = await fetch(`/api/billing?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Could not load your orders.");
      return (await res.json()) as {
        invoices: InvoiceRecord[];
        nextCursor: string | null;
        total: number;
      };
    },
    [debounced, segment],
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setPage(1);
    (async () => {
      const all: InvoiceRecord[] = [];
      let cur: string | null = null;
      let tot = 0;
      for (let i = 0; i < 200; i++) {
        const d = await fetchPage(cur);
        if (!alive) return;
        all.push(...d.invoices);
        tot = d.total;
        if (!d.nextCursor) break;
        cur = d.nextCursor;
      }
      if (!alive) return;
      setOrders(all);
      setTotal(tot);
    })()
      .catch((e: Error) => alive && toast.error(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [fetchPage, toast]);

  const pageRows = orders.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div>
      <PageHeader
        title="Orders"
        subtitle={
          loading ? "Loading…" : `${total.toLocaleString()} completed order${total === 1 ? "" : "s"}`
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Order number or customer"
          className="h-9 w-full sm:w-56"
          aria-label="Search orders"
        />
        <Segmented
          value={segment}
          onChange={setSegment}
          options={[
            { value: "all", label: "All" },
            ...SEGMENTS.map((s) => ({ value: s.key, label: s.label })),
          ]}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[42rem] border-collapse text-sm">
            <thead className="border-b border-line bg-subtle">
              <tr>
                {["Order", "Customer", "Channel", "Date", "Status", "Total"].map(
                  (h, i) => (
                    <th
                      key={h}
                      className={cx(
                        "px-3 py-2.5 text-xs font-semibold text-ink-2",
                        i === 5 ? "text-right" : "text-left",
                      )}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td colSpan={6} className="px-3 py-3">
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      title="No completed orders yet"
                      message="Paid invoices from every channel show up here. Take a sale at the till to see one."
                      action={
                        <Link href="/portal/billing">
                          <Button variant="primary">Open the till</Button>
                        </Link>
                      }
                    />
                  </td>
                </tr>
              ) : (
                pageRows.map((o) => {
                  const seg = segmentDef(o.segment);
                  return (
                    <tr
                      key={o.id}
                      className="border-b border-line transition-colors last:border-0 hover:bg-subtle/60"
                    >
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/portal/invoices/${o.id}`}
                          className="font-medium text-ink hover:text-accent"
                        >
                          {o.number}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-ink-2">
                        {o.customer?.name || o.walkInName || "Walk-in"}
                      </td>
                      <td className="px-3 py-2.5">
                        {seg && (
                          <span
                            className={cx(
                              "rounded-md px-2 py-0.5 text-xs font-medium",
                              seg.badge,
                            )}
                          >
                            {seg.label}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-muted">
                        {new Date(o.issuedAt).toLocaleDateString("en-GB")}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge tone={STATUS_TONE[o.status]} dot>
                          {STATUS_LABEL[o.status]}
                        </Badge>
                      </td>
                      <td className="tnum px-3 py-2.5 text-right font-medium text-ink">
                        {money(o.totals.total)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {!loading && orders.length > 0 && (
          <Pagination
            total={orders.length}
            page={page}
            pageSize={pageSize}
            onPage={setPage}
            onPageSize={setPageSize}
          />
        )}
      </div>
    </div>
  );
}
