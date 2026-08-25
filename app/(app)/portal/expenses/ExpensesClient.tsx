"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { money } from "@/lib/business";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_METHODS,
  type Expense,
} from "@/lib/expenses-types";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  SectionLabel,
  Segmented,
  Select,
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

function rangeStart(key: Period): number {
  const now = new Date();
  const d = new Date();
  switch (key) {
    case "today":
      d.setHours(0, 0, 0, 0);
      break;
    case "7d":
      d.setDate(now.getDate() - 7);
      d.setHours(0, 0, 0, 0);
      break;
    case "1m":
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      break;
    case "3m":
      d.setMonth(now.getMonth() - 3);
      d.setHours(0, 0, 0, 0);
      break;
    case "1y":
      d.setFullYear(now.getFullYear() - 1);
      d.setHours(0, 0, 0, 0);
      break;
    default:
      return 0;
  }
  return +d;
}

const methodLabel = (m: string) =>
  m === "bank transfer" ? "Bank" : m.charAt(0).toUpperCase() + m.slice(1);

export default function ExpensesClient() {
  const toast = useToast();
  const [rows, setRows] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<Period>("1m");
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Add form
  const [fCat, setFCat] = useState(EXPENSE_CATEGORIES[0]);
  const [fAmount, setFAmount] = useState("");
  const [fMethod, setFMethod] = useState("cash");
  const [fDesc, setFDesc] = useState("");
  const [fNote, setFNote] = useState("");
  const [fDate, setFDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/expenses", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not load expenses.");
      setRows(d.expenses ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load expenses.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = useMemo(
    () => Array.from(new Set(rows.map((r) => r.category))).sort(),
    [rows],
  );

  const shown = useMemo(() => {
    const from = rangeStart(period);
    const ql = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (from && +new Date(r.date) < from) return false;
      if (cat !== "all" && r.category !== cat) return false;
      if (
        ql &&
        !`${r.category} ${r.description} ${r.note}`.toLowerCase().includes(ql)
      )
        return false;
      return true;
    });
  }, [rows, period, cat, q]);

  // Reset to the first page whenever a filter narrows or widens the list.
  useEffect(() => {
    setPage(1);
  }, [period, cat, q]);

  const pageRows = useMemo(
    () => shown.slice((page - 1) * pageSize, page * pageSize),
    [shown, page, pageSize],
  );

  const total = shown.reduce((s, r) => s + r.amount, 0);
  const cashTotal = shown
    .filter((r) => r.method === "cash")
    .reduce((s, r) => s + r.amount, 0);
  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of shown) m.set(r.category, (m.get(r.category) || 0) + r.amount);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [shown]);

  async function add() {
    if (!(Number(fAmount) > 0)) {
      toast.error("Enter an amount greater than zero.");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date: fDate,
          category: fCat,
          description: fDesc,
          amount: Number(fAmount),
          method: fMethod,
          note: fNote,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not record the expense.");
      toast.success("Expense recorded.");
      setFAmount("");
      setFDesc("");
      setFNote("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record the expense.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this expense?")) return;
    try {
      const r = await fetch(`/api/expenses?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || "Could not delete.");
      }
      setRows((rs) => rs.filter((r) => r.id !== id));
      toast.success("Expense deleted.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete.");
    }
  }

  function exportCsv() {
    const header = ["Date", "Category", "Description", "Amount", "Method", "Note", "Added by"];
    const lines = shown.map((r) =>
      [
        new Date(r.date).toLocaleDateString("en-GB"),
        r.category,
        r.description,
        r.amount.toFixed(2),
        r.method,
        r.note,
        r.createdBy,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], {
      type: "text/csv",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        subtitle="Rent, stock, utilities, wages and the rest — what the shop spends."
        actions={
          <Button variant="secondary" onClick={exportCsv} disabled={shown.length === 0}>
            Export CSV
          </Button>
        }
      />

      {error && <Alert tone="danger">{error}</Alert>}

      {/* Add */}
      <Card>
        <div className="p-4 sm:p-5">
          <SectionLabel>Record an expense</SectionLabel>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Date">
              <Input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} />
            </Field>
            <Field label="Category">
              <Select value={fCat} onChange={(e) => setFCat(e.target.value)}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
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
            <Field label="Paid by">
              <Select value={fMethod} onChange={(e) => setFMethod(e.target.value)}>
                {EXPENSE_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {methodLabel(m)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <Input
                value={fDesc}
                onChange={(e) => setFDesc(e.target.value)}
                placeholder="e.g. LCD stock from Ali Traders"
              />
            </Field>
            <Field label="Note" className="sm:col-span-2">
              <Input value={fNote} onChange={(e) => setFNote(e.target.value)} />
            </Field>
          </div>
          <div className="mt-3">
            <Button variant="primary" loading={saving} onClick={add}>
              Add expense
            </Button>
          </div>
        </div>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total (filtered)" value={money(total)} tone="warning" loading={loading} />
        <StatCard label="Of which cash" value={money(cashTotal)} loading={loading} />
        <StatCard label="Entries" value={shown.length} loading={loading} />
        <StatCard label="Categories" value={byCat.length} loading={loading} />
      </div>

      {/* Filters + list */}
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4 sm:p-5">
          <Segmented value={period} onChange={setPeriod} options={PERIODS.map((p) => ({ ...p }))} />
          <Select value={cat} onChange={(e) => setCat(e.target.value)} className="w-auto">
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="min-w-[10rem] flex-1"
          />
        </div>

        {loading ? (
          <div className="space-y-2 p-4 sm:p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <EmptyState
            title="No expenses"
            message="Nothing recorded for this filter yet."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] border-collapse text-sm">
              <thead className="border-b border-line bg-subtle text-left text-xs font-semibold text-ink-2">
                <tr>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Category</th>
                  <th className="px-3 py-2.5">Description</th>
                  <th className="px-3 py-2.5">Paid by</th>
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
                    <td className="px-3 py-2.5">
                      <Badge tone="neutral">{r.category}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-ink-2">
                      {r.description || "—"}
                      {r.note && <span className="block text-xs text-muted">{r.note}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-muted">{methodLabel(r.method)}</td>
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

        {!loading && shown.length > 0 && (
          <Pagination
            total={shown.length}
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
