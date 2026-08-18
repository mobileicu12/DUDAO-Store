"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { money } from "@/lib/business";
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  SectionLabel,
  Skeleton,
  StatCard,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

type Method = "cash" | "card" | "bank" | "account";
type Breakdown = Record<Method, number> & { total: number };
type Line = { name: string; method: string; amount: number };

type Settlement = {
  businessDay: string;
  byMethod: Breakdown;
  expectedCash: number;
  expectedCard: number;
  cashExpenses: number;
  paymentCount: number;
  accountLines: Line[];
  counterByMethod: Breakdown;
};

type CashUp = {
  id: string;
  businessDay: string;
  createdAt: string;
  who: string;
  float: number;
  expectedCash: number;
  cashExpenses: number;
  countedCash: number;
  variance: number;
  countedCard: number;
  cardVariance: number;
  note: string;
};

const dt = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const METHOD_LABEL: Record<Method, string> = {
  cash: "Cash",
  card: "Card",
  bank: "Bank transfer",
  account: "On account",
};

const varianceTone = (v: number) =>
  v === 0 ? "success" : Math.abs(v) < 1 ? "warning" : "danger";

export default function CashUpClient() {
  const toast = useToast();
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [history, setHistory] = useState<CashUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [counted, setCounted] = useState("");
  const [countedCard, setCountedCard] = useState("");
  const [float, setFloat] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/cash-up", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not load the cash-up.");
      setSettlement(d.settlement);
      setHistory(d.history ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load the cash-up.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const expectedCash = settlement?.expectedCash ?? 0;
  const expectedCard = settlement?.expectedCard ?? 0;

  const variance = useMemo(() => {
    if (counted === "") return null;
    return Math.round(((Number(counted) || 0) - (Number(float) || 0) - expectedCash) * 100) / 100;
  }, [counted, float, expectedCash]);

  const cardVariance = useMemo(() => {
    if (countedCard === "") return null;
    return Math.round(((Number(countedCard) || 0) - expectedCard) * 100) / 100;
  }, [countedCard, expectedCard]);

  async function save() {
    if (counted === "") {
      toast.error("Enter the counted cash first.");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/cash-up", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          countedCash: Number(counted),
          countedCard: countedCard === "" ? 0 : Number(countedCard),
          float: Number(float) || 0,
          note,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not record the cash-up.");
      toast.success(
        d.variance === 0
          ? "Cash-up recorded — drawer balanced."
          : `Cash-up recorded — ${d.variance < 0 ? "short" : "over"} by ${money(Math.abs(d.variance))}.`,
      );
      setCounted("");
      setCountedCard("");
      setFloat("");
      setNote("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record the cash-up.");
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    const header = [
      "Day",
      "Recorded",
      "By",
      "Float",
      "Expected cash",
      "Cash expenses",
      "Counted cash",
      "Cash variance",
      "Counted card",
      "Card variance",
      "Note",
    ];
    const lines = history.map((h) =>
      [
        h.businessDay,
        new Date(h.createdAt).toLocaleString("en-GB"),
        h.who,
        h.float.toFixed(2),
        h.expectedCash.toFixed(2),
        h.cashExpenses.toFixed(2),
        h.countedCash.toFixed(2),
        h.variance.toFixed(2),
        h.countedCard.toFixed(2),
        h.cardVariance.toFixed(2),
        h.note,
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
    a.download = `cash-ups-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cash up"
        subtitle="Count the drawer at close and reconcile it against today's takings."
        actions={
          <Button
            variant="secondary"
            disabled={history.length === 0}
            onClick={exportCsv}
          >
            Export CSV
          </Button>
        }
      />

      {/* Today's takings by method */}
      <div>
        <SectionLabel>Today&apos;s takings</SectionLabel>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(["cash", "card", "bank", "account"] as Method[]).map((m) => (
            <StatCard
              key={m}
              label={METHOD_LABEL[m]}
              value={money(settlement?.byMethod[m] ?? 0)}
              tone={m === "cash" ? "accent" : "neutral"}
              loading={loading}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Count the drawer */}
        <Card>
          <div className="space-y-4 p-4 sm:p-5">
            <SectionLabel>Count the drawer</SectionLabel>

            {loading ? (
              <Skeleton className="h-52 w-full" />
            ) : (
              <>
                <div className="space-y-1.5 rounded-lg border border-line bg-subtle px-3.5 py-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Cash taken</span>
                    <span className="tnum text-ink">{money(settlement?.byMethod.cash ?? 0)}</span>
                  </div>
                  {(settlement?.cashExpenses ?? 0) > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted">− Cash expenses</span>
                      <span className="tnum text-danger">
                        −{money(settlement?.cashExpenses ?? 0)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between border-t border-line pt-1.5 font-semibold">
                    <span className="text-ink">Expected cash (before float)</span>
                    <span className="tnum text-ink">{money(expectedCash)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Opening float" hint="Cash left in at open">
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      value={float}
                      onChange={(e) => setFloat(e.target.value)}
                      placeholder="0.00"
                    />
                  </Field>
                  <Field label="Counted cash" hint="What's in the drawer now">
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      value={counted}
                      onChange={(e) => setCounted(e.target.value)}
                      placeholder="0.00"
                      autoFocus
                    />
                  </Field>
                </div>

                {variance !== null && (
                  <Alert tone={varianceTone(variance)}>
                    {variance === 0 ? (
                      <span className="font-medium">Cash balances exactly. 🎯</span>
                    ) : (
                      <span>
                        Cash is{" "}
                        <strong>
                          {variance < 0 ? "short" : "over"} by {money(Math.abs(variance))}
                        </strong>{" "}
                        (counted {money(Number(counted) || 0)} − float {money(Number(float) || 0)} −
                        expected {money(expectedCash)}).
                      </span>
                    )}
                  </Alert>
                )}

                <Field
                  label="Counted card (optional)"
                  hint={`Terminal expects ${money(expectedCard)}`}
                >
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={countedCard}
                    onChange={(e) => setCountedCard(e.target.value)}
                    placeholder="0.00"
                  />
                </Field>

                {cardVariance !== null && countedCard !== "" && (
                  <Alert tone={varianceTone(cardVariance)}>
                    {cardVariance === 0 ? (
                      <span className="font-medium">Card matches the terminal.</span>
                    ) : (
                      <span>
                        Card is{" "}
                        <strong>
                          {cardVariance < 0 ? "short" : "over"} by {money(Math.abs(cardVariance))}
                        </strong>
                        .
                      </span>
                    )}
                  </Alert>
                )}

                <Field label="Note (optional)">
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. £5 short, made up from petty cash"
                  />
                </Field>

                <Button variant="primary" full loading={saving} onClick={save}>
                  Record cash-up
                </Button>
              </>
            )}
          </div>
        </Card>

        {/* Who paid today (system breakdown) */}
        <Card>
          <div className="p-4 sm:p-5">
            <SectionLabel>Who paid today</SectionLabel>
            {loading ? (
              <Skeleton className="mt-3 h-52 w-full" />
            ) : (settlement?.accountLines.length ?? 0) === 0 &&
              (settlement?.counterByMethod.total ?? 0) === 0 ? (
              <p className="mt-2 text-sm text-muted">No payments taken today yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line text-sm">
                {settlement?.accountLines.map((l, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate text-ink-2">
                      {l.name}{" "}
                      <span className="text-muted">· {METHOD_LABEL[l.method as Method] ?? l.method}</span>
                    </span>
                    <span className="tnum font-medium text-ink">{money(l.amount)}</span>
                  </li>
                ))}
                {(settlement?.counterByMethod.total ?? 0) > 0 && (
                  <li className="flex items-center justify-between gap-3 py-2">
                    <span className="text-ink-2">
                      Counter / walk-in{" "}
                      <span className="text-muted">
                        · cash {money(settlement?.counterByMethod.cash ?? 0)}, card{" "}
                        {money(settlement?.counterByMethod.card ?? 0)}
                      </span>
                    </span>
                    <span className="tnum font-medium text-ink">
                      {money(settlement?.counterByMethod.total ?? 0)}
                    </span>
                  </li>
                )}
              </ul>
            )}
          </div>
        </Card>
      </div>

      {/* History */}
      <Card>
        <div className="p-4 sm:p-5">
          <SectionLabel>Recent cash-ups</SectionLabel>
          {loading ? (
            <Skeleton className="mt-3 h-24 w-full" />
          ) : history.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No cash-ups recorded yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {history.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      {h.businessDay}{" "}
                      <span className="font-normal text-muted">· {h.who || "—"}</span>
                    </p>
                    <p className="truncate text-xs text-muted">
                      Counted {money(h.countedCash)} · expected {money(h.expectedCash)}
                      {h.float ? ` + ${money(h.float)} float` : ""} · {dt(h.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {h.countedCard > 0 && (
                      <Badge tone={varianceTone(h.cardVariance)}>
                        card {h.cardVariance < 0 ? "−" : h.cardVariance > 0 ? "+" : ""}
                        {money(Math.abs(h.cardVariance)).replace(/^[^0-9-]*/, "")}
                      </Badge>
                    )}
                    <Badge tone={varianceTone(h.variance)}>
                      {h.variance === 0
                        ? "Balanced"
                        : `${h.variance < 0 ? "−" : "+"}${money(Math.abs(h.variance)).replace(/^[^0-9-]*/, "")}`}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
