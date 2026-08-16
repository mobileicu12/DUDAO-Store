"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { money } from "@/lib/business";
import { statusView } from "@/lib/billing-shared";
import { SEGMENTS, segmentDef } from "@/lib/segments";
import type { InvoiceRecord } from "@/lib/billing";
import { useCanSeeFinance } from "@/lib/use-me";
import {
  Badge,
  Button,
  cx,
  EmptyState,
  Input,
  PageHeader,
  Skeleton,
  StatCard,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import PdfPreviewModal from "@/components/PdfPreviewModal";

type Summary = { count: number; billed: number; paid: number; outstanding: number };
type Preset = "today" | "7days" | "month" | "all";

/** Black-active segmented control, as on the reference. */
function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex items-center rounded-lg border border-line-strong bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-md px-3 py-1 text-xs font-semibold transition-colors",
            value === o.value ? "bg-ink text-surface" : "text-ink-2 hover:bg-subtle",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const isoToday = () => new Date().toISOString().slice(0, 10);

export default function InvoicesClient() {
  const toast = useToast();
  const canSeeFinance = useCanSeeFinance();

  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("all");
  const [segment, setSegment] = useState("all");
  const [staff, setStaff] = useState("all");
  const [preset, setPreset] = useState<Preset>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reportsOpen, setReportsOpen] = useState(false);
  const [preview, setPreview] = useState<InvoiceRecord | null>(null);
  const reportsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!reportsOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!reportsRef.current?.contains(e.target as Node)) setReportsOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [reportsOpen]);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    const today = isoToday();
    if (p === "today") {
      setFrom(today);
      setTo(today);
    } else if (p === "7days") {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      setFrom(d.toISOString().slice(0, 10));
      setTo(today);
    } else if (p === "month") {
      const d = new Date();
      setFrom(new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10));
      setTo(today);
    } else {
      setFrom("");
      setTo("");
    }
  };

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
        summary: Summary;
      };
    },
    [debounced, status, segment, from, to],
  );

  const reload = useCallback(() => {
    let alive = true;
    setLoading(true);
    setSelected(new Set());
    fetchPage(null)
      .then((d) => {
        if (!alive) return;
        setInvoices(d.invoices);
        setCursor(d.nextCursor);
        setTotal(d.total);
        setSummary(d.summary);
      })
      .catch((e: Error) => alive && toast.error(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [fetchPage, toast]);

  useEffect(() => reload(), [reload]);

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

  // Staff filter runs over the loaded rows — the API paginates by date, so this
  // narrows what's on screen.
  const staffNames = useMemo(
    () => Array.from(new Set(invoices.map((i) => i.staffName).filter(Boolean))).sort(),
    [invoices],
  );
  const rows = useMemo(
    () => (staff === "all" ? invoices : invoices.filter((i) => i.staffName === staff)),
    [invoices, staff],
  );

  const csvFor = (list: InvoiceRecord[]) => {
    const data = [
      ["Invoice", "Date", "Customer", "Source", "Staff", "Status", "Total", "Paid", "Balance"],
      ...list.map((i) => [
        i.number,
        new Date(i.issuedAt).toLocaleDateString("en-GB"),
        i.customer?.name || i.walkInName || "Walk-in",
        segmentDef(i.segment)?.label ?? i.segment,
        i.staffName,
        statusView(i.status, i.totals.paid, i.totals.balance).label,
        i.totals.total.toFixed(2),
        i.totals.paid.toFixed(2),
        i.totals.balance.toFixed(2),
      ]),
    ];
    const csv = data.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoices-${isoToday()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleAll = () => {
    setSelected((prev) =>
      prev.size === rows.length ? new Set() : new Set(rows.map((i) => i.id)),
    );
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkMarkPaid = async () => {
    const ids = rows.filter((i) => selected.has(i.id) && i.totals.balance > 0).map((i) => i.id);
    if (ids.length === 0) return toast.error("No unpaid invoices selected.");
    setBusy(true);
    try {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/billing/${id}/action`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "pay-balance", method: "cash" }),
          }),
        ),
      );
      toast.success(`Marked ${ids.length} paid.`);
      reload();
    } catch {
      toast.error("Some invoices could not be updated.");
    } finally {
      setBusy(false);
    }
  };

  const bulkDelete = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} invoice${ids.length === 1 ? "" : "s"}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await Promise.all(ids.map((id) => fetch(`/api/billing/${id}`, { method: "DELETE" })));
      toast.success(`Deleted ${ids.length}.`);
      reload();
    } catch {
      toast.error("Some invoices could not be deleted.");
    } finally {
      setBusy(false);
    }
  };

  const allChecked = rows.length > 0 && selected.size === rows.length;
  const someSelected = selected.size > 0;

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle="Bills & invoices created from the portal. Click a row to edit."
        actions={
          <>
            <Link href="/portal/billing">
              <Button variant="primary">+ New bill</Button>
            </Link>
            <div className="relative" ref={reportsRef}>
              <Button onClick={() => setReportsOpen((v) => !v)}>Export / Reports ▾</Button>
              {reportsOpen && (
                <div className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-lg border border-line bg-surface p-1.5 shadow-pop">
                  <a
                    href={`/api/billing/report?${new URLSearchParams({ status, segment, ...(from ? { from } : {}), ...(to ? { to } : {}) })}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-md px-2.5 py-2 text-sm text-ink-2 hover:bg-subtle hover:text-ink"
                    onClick={() => setReportsOpen(false)}
                  >
                    📄 Sales report PDF
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      csvFor(rows);
                      setReportsOpen(false);
                    }}
                    className="block w-full rounded-md px-2.5 py-2 text-left text-sm text-ink-2 hover:bg-subtle hover:text-ink"
                  >
                    📊 Export view to CSV
                  </button>
                </div>
              )}
            </div>
          </>
        }
      />

      {/* Filters */}
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice # or customer…"
            className="h-9 w-full sm:w-56"
          />
          <Segmented
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: "All" },
              { value: "open", label: "Open" },
              { value: "PAID", label: "Paid" },
            ]}
          />
          <Segmented
            value={segment}
            onChange={setSegment}
            options={[
              { value: "all", label: "All" },
              ...SEGMENTS.map((s) => ({ value: s.key, label: s.label })),
            ]}
          />
          {staffNames.length > 0 && (
            <select
              value={staff}
              onChange={(e) => setStaff(e.target.value)}
              className="h-9 rounded-md border border-line-strong bg-surface px-3 text-sm text-ink"
            >
              <option value="all">All staff</option>
              {staffNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          )}
          <span className="text-xs text-muted">{rows.length} shown</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={preset}
            onChange={applyPreset}
            options={[
              { value: "today", label: "Today" },
              { value: "7days", label: "7 days" },
              { value: "month", label: "Month" },
              { value: "all", label: "All" },
            ]}
          />
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPreset("all");
            }}
            className="h-9 w-auto"
          />
          <span className="text-xs text-muted">to</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPreset("all");
            }}
            className="h-9 w-auto"
          />
          {summary && canSeeFinance && (
            <span className="ml-auto text-xs text-muted">
              All time: <span className="font-semibold text-ink-2">{summary.count} bills</span> ·{" "}
              {money(summary.billed)} · paid {money(summary.paid)} · due{" "}
              <span className="text-warning">{money(summary.outstanding)}</span>
            </span>
          )}
        </div>
      </div>

      {/* Stat cards */}
      {canSeeFinance && (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Invoices" value={(summary?.count ?? total).toLocaleString()} loading={loading} />
          <StatCard label="Outstanding" value={money(summary?.outstanding ?? 0)} tone="warning" loading={loading} />
          <StatCard label="Paid" value={money(summary?.paid ?? 0)} tone="success" loading={loading} />
          <StatCard label="Total billed" value={money(summary?.billed ?? 0)} loading={loading} />
        </div>
      )}

      {/* Bulk bar */}
      <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex cursor-pointer items-center gap-2 text-ink-2">
          <input type="checkbox" checked={allChecked} onChange={toggleAll} className="h-4 w-4 accent-[var(--accent)]" />
          Select all
        </label>
        <button
          type="button"
          disabled={!someSelected || busy}
          onClick={bulkMarkPaid}
          className="font-medium text-muted transition-colors hover:text-success disabled:opacity-40"
        >
          ✓ Mark paid
        </button>
        <button
          type="button"
          disabled={!someSelected}
          onClick={() => csvFor(rows.filter((i) => selected.has(i.id)))}
          className="font-medium text-muted transition-colors hover:text-ink disabled:opacity-40"
        >
          ⬇ Excel
        </button>
        <button
          type="button"
          disabled={!someSelected || busy}
          onClick={bulkDelete}
          className="font-medium text-danger transition-colors hover:brightness-110 disabled:opacity-40"
        >
          Delete
        </button>
        {someSelected && <span className="text-xs text-muted">{selected.size} selected</span>}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] border-collapse text-sm">
            <thead className="border-b border-line bg-subtle">
              <tr className="text-left text-xs font-semibold text-ink-2">
                <th className="w-10 px-3 py-2.5" />
                <th className="px-3 py-2.5">Invoice</th>
                <th className="px-3 py-2.5">Customer</th>
                <th className="px-3 py-2.5">Source</th>
                <th className="px-3 py-2.5">Staff</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5 text-right">Total</th>
                <th className="px-3 py-2.5 text-right">Export</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td colSpan={9} className="px-3 py-3">
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9}>
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
                rows.map((i) => {
                  const seg = segmentDef(i.segment);
                  return (
                    <tr key={i.id} className="border-b border-line transition-colors last:border-0 hover:bg-subtle/60">
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={selected.has(i.id)}
                          onChange={() => toggleOne(i.id)}
                          className="h-4 w-4 accent-[var(--accent)]"
                          aria-label={`Select ${i.number}`}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <Link href={`/portal/invoices/${i.id}`} className="font-medium text-ink hover:text-accent">
                          {i.number}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="block truncate text-ink-2">
                          {i.customer?.name || i.walkInName || "Walk-in"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {seg && (
                          <span className={cx("inline-flex rounded-md px-2 py-0.5 text-xs font-medium", seg.badge)}>
                            {seg.short}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-muted">{i.staffName || "—"}</td>
                      <td className="px-3 py-2.5">
                        {(() => {
                          const sv = statusView(
                            i.status,
                            i.totals.paid,
                            i.totals.balance,
                          );
                          return (
                            <Badge tone={sv.tone} dot>
                              {sv.label}
                            </Badge>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2.5 text-muted">
                        {new Date(i.issuedAt).toLocaleDateString("en-GB")}
                      </td>
                      <td className="tnum px-3 py-2.5 text-right text-ink">{money(i.totals.total)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setPreview(i)}
                            className="rounded-md bg-ink px-2 py-1 text-xs font-semibold text-surface hover:opacity-90"
                          >
                            PDF
                          </button>
                          <button
                            type="button"
                            onClick={() => csvFor([i])}
                            className="rounded-md border border-line-strong px-2 py-1 text-xs font-medium text-ink-2 hover:bg-subtle"
                          >
                            Excel
                          </button>
                        </div>
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

      {preview && (
        <PdfPreviewModal
          src={`/api/public/invoice/${preview.id}`}
          title={`Invoice ${preview.number}`}
          subtitle={preview.customer?.name || preview.walkInName || undefined}
          filename={`invoice-${preview.number}.pdf`}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
