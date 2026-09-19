"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { money } from "@/lib/business";
import { useIsOwner } from "@/lib/use-me";
import type { Buying } from "@/lib/settlements";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  SectionLabel,
  Segmented,
  Skeleton,
  StatCard,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { Pagination } from "@/components/ui/Pagination";

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "1m", label: "This month" },
  { value: "3m", label: "3 months" },
  { value: "1y", label: "Year" },
  { value: "all", label: "All" },
] as const;

type Period = (typeof PERIODS)[number]["value"];

function rangeFor(key: Period): { from: string; to: string } {
  const now = new Date();
  const to = now.toLocaleDateString("en-CA");
  const d = new Date();
  switch (key) {
    case "today":
      break;
    case "7d":
      d.setDate(now.getDate() - 6);
      break;
    case "1m":
      d.setDate(1);
      break;
    case "3m":
      d.setMonth(now.getMonth() - 3);
      break;
    case "1y":
      d.setFullYear(now.getFullYear() - 1);
      break;
    default:
      return { from: "", to: "" };
  }
  return { from: d.toLocaleDateString("en-CA"), to };
}

export default function SettlementsClient() {
  const toast = useToast();
  const isOwner = useIsOwner();
  const [period, setPeriod] = useState<Period>("1m");
  const [rows, setRows] = useState<Buying[]>([]);
  const [sales, setSales] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Add form
  const [fSupplier, setFSupplier] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fAmount, setFAmount] = useState("");
  const [fDate, setFDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { from, to } = rangeFor(period);
      const qs = new URLSearchParams();
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      const r = await fetch(`/api/settlements?${qs}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not load settlements.");
      setRows(d.buying ?? []);
      setSales(Number(d.salesReceived) || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load settlements.");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    if (isOwner) void load();
  }, [isOwner, load]);

  const { from, to } = rangeFor(period);
  const inPeriod = useMemo(() => {
    const f = from ? +new Date(`${from}T00:00:00`) : 0;
    const t = to ? +new Date(`${to}T23:59:59`) : Date.now();
    return rows.filter((r) => {
      const x = +new Date(r.date);
      return x >= f && x <= t;
    });
  }, [rows, from, to]);

  // Reset to page one when the period filter changes the row set.
  useEffect(() => {
    setPage(1);
  }, [period]);

  const pageRows = useMemo(
    () => inPeriod.slice((page - 1) * pageSize, page * pageSize),
    [inPeriod, page, pageSize],
  );

  const buyingIncluded = inPeriod
    .filter((r) => r.included)
    .reduce((s, r) => s + r.amount, 0);
  const buyingExcluded = inPeriod
    .filter((r) => !r.included)
    .reduce((s, r) => s + r.amount, 0);
  const net = Math.round((sales - buyingIncluded) * 100) / 100;

  async function add() {
    if (!(Number(fAmount) > 0)) {
      toast.error("Enter an amount greater than zero.");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/settlements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date: fDate,
          supplier: fSupplier,
          description: fDesc,
          amount: Number(fAmount),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not add the entry.");
      toast.success("Buying cost added.");
      setFSupplier("");
      setFDesc("");
      setFAmount("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add the entry.");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(id: string, included: boolean) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, included } : r)));
    await fetch("/api/settlements", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, included }),
    }).catch(() => toast.error("Could not update."));
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this buying entry?")) return;
    const r = await fetch(`/api/settlements?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (r.ok) {
      setRows((rs) => rs.filter((r) => r.id !== id));
      toast.success("Deleted.");
    } else {
      toast.error("Could not delete.");
    }
  }

  if (!isOwner) {
    return (
      <div>
        <PageHeader title="Settlement" />
        <Alert tone="warning" title="Owner only">
          Buying costs and net earnings are visible to the business owner only.
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settlement & buying"
        subtitle="Stock you bought to resell, settled against sales received — your net earnings."
      />

      {error && <Alert tone="danger">{error}</Alert>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Sales received" value={money(sales)} loading={loading} />
        <StatCard label="Buying (counted)" value={money(buyingIncluded)} tone="warning" loading={loading} />
        <StatCard
          label="Net earnings"
          value={money(net)}
          tone={net >= 0 ? "success" : "danger"}
          loading={loading}
        />
        <StatCard label="Buying (excluded)" value={money(buyingExcluded)} loading={loading} />
      </div>

      <Card>
        <div className="p-4 sm:p-5">
          <SectionLabel>Log a buying cost</SectionLabel>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Date">
              <Input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} />
            </Field>
            <Field label="Supplier">
              <Input value={fSupplier} onChange={(e) => setFSupplier(e.target.value)} placeholder="e.g. Ali Traders" />
            </Field>
            <Field label="Amount">
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={fAmount}
                onChange={(e) => setFAmount(e.target.value)}
                placeholder="0.00"
              />
            </Field>
            <Field label="Description">
              <Input value={fDesc} onChange={(e) => setFDesc(e.target.value)} placeholder="e.g. 50× iPhone LCDs" />
            </Field>
          </div>
          <div className="mt-3">
            <Button variant="primary" loading={saving} onClick={add}>
              Add buying cost
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4 sm:p-5">
          <Segmented value={period} onChange={setPeriod} options={PERIODS.map((p) => ({ ...p }))} />
          <span className="ml-auto text-xs text-muted">
            Toggle an entry out to compare gross vs settled net.
          </span>
        </div>

        {loading ? (
          <div className="space-y-2 p-4 sm:p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : inPeriod.length === 0 ? (
          <EmptyState title="No buying costs" message="Nothing logged for this period." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] border-collapse text-sm">
              <thead className="border-b border-line bg-subtle text-left text-xs font-semibold text-ink-2">
                <tr>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Supplier</th>
                  <th className="px-3 py-2.5">Description</th>
                  <th className="px-3 py-2.5 text-center">In net</th>
                  <th className="px-3 py-2.5 text-right">Amount</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2.5 text-muted">
                      {new Date(r.date).toLocaleDateString("en-GB")}
                    </td>
                    <td className="px-3 py-2.5 text-ink-2">{r.supplier || "—"}</td>
                    <td className="px-3 py-2.5 text-muted">{r.description || "—"}</td>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={r.included}
                        onChange={(e) => toggle(r.id, e.target.checked)}
                        aria-label="Include in net earnings"
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                    </td>
                    <td className="tnum px-3 py-2.5 text-right font-medium text-ink">
                      {money(r.amount)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => remove(r.id)}
                        className="text-xs font-medium text-muted hover:text-danger"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && inPeriod.length > 0 && (
          <Pagination
            total={inPeriod.length}
            page={page}
            pageSize={pageSize}
            onPage={setPage}
            onPageSize={setPageSize}
          />
        )}
      </Card>
    </div>
  );
}
