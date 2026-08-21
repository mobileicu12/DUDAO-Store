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
import { Pagination } from "@/components/ui/Pagination";
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
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

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

  // Client-side sort of the loaded rows (the API paginates by date).
  const [sortKey, setSortKey] = useState<
    "number" | "customer" | "segment" | "staff" | "status" | "date" | "total"
  >("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const onSort = (k: typeof sortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "date" || k === "total" ? "desc" : "asc");
    }
  };
  const arrow = (k: typeof sortKey) => (sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : "");

  // Just-deleted invoices, kept so the delete can be undone from a banner
  // (restores from the audit snapshot, same as the Activity log).
  const [deleted, setDeleted] = useState<{ auditId: string; number: string }[]>([]);
  const [undoing, setUndoing] = useState(false);

  const undoDelete = async () => {
    if (deleted.length === 0) return;
    setUndoing(true);
    let ok = 0;
    for (const d of deleted) {
      try {
        const res = await fetch("/api/logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "restore", id: d.auditId }),
        });
        if (res.ok) ok++;
      } catch {
        /* keep going */
      }
    }
    setUndoing(false);
    setDeleted([]);
    toast.success(`Restored ${ok} invoice${ok === 1 ? "" : "s"}.`);
    reload();
  };

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // A delete from an invoice's own page hands its undo here via ?undo=<auditId>.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const auditId = params.get("undo");
    if (auditId) {
      setDeleted([{ auditId, number: params.get("num") ?? "" }]);
      window.history.replaceState(null, "", "/portal/invoices");
    }
  }, []);

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
      const params = new URLSearchParams({ limit: "200", status, segment });
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

  // Load every matching row so the pager can page across the whole set (the API
  // paginates by cursor; we follow it to the end, with a safety cap).
  const reload = useCallback(() => {
    let alive = true;
    setLoading(true);
    setSelected(new Set());
    setPage(1);
    (async () => {
      const all: InvoiceRecord[] = [];
      let cur: string | null = null;
      let sum: Summary | null = null;
      let tot = 0;
      for (let i = 0; i < 200; i++) {
        const d = await fetchPage(cur);
        if (!alive) return;
        all.push(...d.invoices);
        sum = d.summary;
        tot = d.total;
        if (!d.nextCursor) break;
        cur = d.nextCursor;
      }
      if (!alive) return;
      setInvoices(all);
      setTotal(tot);
      setSummary(sum);
    })()
      .catch((e: Error) => alive && toast.error(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [fetchPage, toast]);

  useEffect(() => reload(), [reload]);

  // Staff filter runs over the loaded rows — the API paginates by date, so this
  // narrows what's on screen.
  const staffNames = useMemo(
    () => Array.from(new Set(invoices.map((i) => i.staffName).filter(Boolean))).sort(),
    [invoices],
  );
  const rows = useMemo(() => {
    const base = staff === "all" ? invoices : invoices.filter((i) => i.staffName === staff);
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (i: InvoiceRecord): string | number => {
      switch (sortKey) {
        case "number": return i.number;
        case "customer": return (i.customer?.name || i.walkInName || "").toLowerCase();
        case "segment": return i.segment;
        case "staff": return i.staffName || "";
        case "status": return statusView(i.status, i.totals.paid, i.totals.balance).label;
        case "total": return i.totals.total;
        default: return +new Date(i.issuedAt);
      }
    };
    return [...base].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [invoices, staff, sortKey, sortDir]);

  // Reset to the first page whenever the filtered/sorted set changes underfoot.
  useEffect(() => setPage(1), [staff, sortKey, sortDir]);
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);

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
    if (!window.confirm(`Delete ${ids.length} invoice${ids.length === 1 ? "" : "s"}? You can undo this straight after.`)) return;
    setBusy(true);
    try {
      const undoable: { auditId: string; number: string }[] = [];
      await Promise.all(
        ids.map(async (id) => {
          const res = await fetch(`/api/billing/${id}`, { method: "DELETE" });
          if (res.ok) {
            const d = (await res.json().catch(() => ({}))) as { auditId?: string; number?: string };
            if (d.auditId) undoable.push({ auditId: d.auditId, number: d.number ?? "" });
          }
        }),
      );
      setDeleted(undoable);
      toast.success(`Deleted ${ids.length}.`, "Use Undo below to restore.");
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
      {deleted.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-accent-subtle px-4 py-3">
          <span className="text-sm text-ink">
            {deleted.length === 1
              ? `Invoice ${deleted[0].number || ""} deleted.`
              : `${deleted.length} invoices deleted.`}
          </span>
          <Button size="sm" loading={undoing} onClick={undoDelete}>
            ↩ Undo
          </Button>
          <button
            type="button"
            onClick={() => setDeleted([])}
            className="ml-auto text-xs font-medium text-muted hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      )}
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
                <SortTh label="Invoice" k="number" sortKey={sortKey} arrow={arrow} onSort={onSort} />
                <SortTh label="Customer" k="customer" sortKey={sortKey} arrow={arrow} onSort={onSort} />
                <SortTh label="Source" k="segment" sortKey={sortKey} arrow={arrow} onSort={onSort} />
                <SortTh label="Staff" k="staff" sortKey={sortKey} arrow={arrow} onSort={onSort} />
                <SortTh label="Status" k="status" sortKey={sortKey} arrow={arrow} onSort={onSort} />
                <SortTh label="Date" k="date" sortKey={sortKey} arrow={arrow} onSort={onSort} />
                <th className="px-3 py-2.5">Paid on</th>
                <SortTh label="Total" k="total" sortKey={sortKey} arrow={arrow} onSort={onSort} align="right" />
                <th className="px-3 py-2.5 text-right">Export</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td colSpan={10} className="px-3 py-3">
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10}>
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
                pageRows.map((i) => {
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
                      <td className="px-3 py-2.5 text-muted">
                        {i.paidAt ? (
                          new Date(i.paidAt).toLocaleDateString("en-GB")
                        ) : i.totals.paid > 0.001 ? (
                          <span className="text-warning">part-paid</span>
                        ) : (
                          "—"
                        )}
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

        {!loading && rows.length > 0 && (
          <Pagination
            total={rows.length}
            page={page}
            pageSize={pageSize}
            onPage={setPage}
            onPageSize={setPageSize}
          />
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

function SortTh<K extends string>({
  label,
  k,
  sortKey,
  arrow,
  onSort,
  align = "left",
}: {
  label: string;
  k: K;
  sortKey: K;
  arrow: (k: K) => string;
  onSort: (k: K) => void;
  align?: "left" | "right";
}) {
  return (
    <th className={cx("px-3 py-2.5", align === "right" && "text-right")}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cx(
          "font-semibold uppercase tracking-wide transition-colors hover:text-ink",
          sortKey === k ? "text-ink" : "text-ink-2",
        )}
      >
        {label}
        <span className="text-accent">{arrow(k)}</span>
      </button>
    </th>
  );
}
