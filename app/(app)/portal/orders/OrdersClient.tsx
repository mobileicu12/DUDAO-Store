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
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [segment, setSegment] = useState("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchPage = useCallback(
    async (next: string | null) => {
      const params = new URLSearchParams({ limit: "50", status: "PAID", segment });
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
    fetchPage(null)
      .then((d) => {
        if (!alive) return;
        setOrders(d.invoices);
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
      setOrders((prev) => [...prev, ...d.invoices]);
      setCursor(d.nextCursor);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

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
                orders.map((o) => {
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
        {cursor && (
          <div className="border-t border-line p-3 text-center">
            <Button variant="secondary" loading={loadingMore} onClick={loadMore}>
              Load more
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
