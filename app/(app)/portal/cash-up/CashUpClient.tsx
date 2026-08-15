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

type Settlement = {
  businessDay: string;
  byMethod: Breakdown;
  expectedCash: number;
  paymentCount: number;
};

type CashUp = {
  id: string;
  businessDay: string;
  createdAt: string;
  who: string;
  float: number;
  expectedCash: number;
  countedCash: number;
  variance: number;
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

export default function CashUpClient() {
  const toast = useToast();
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [history, setHistory] = useState<CashUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [counted, setCounted] = useState("");
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
  const variance = useMemo(() => {
    if (counted === "") return null;
    const c = Number(counted) || 0;
    const f = Number(float) || 0;
    return Math.round((c - f - expectedCash) * 100) / 100;
  }, [counted, float, expectedCash]);

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
      setFloat("");
      setNote("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record the cash-up.");
    } finally {
      setSaving(false);
    }
  }

  const varianceTone = (v: number) =>
    v === 0 ? "success" : Math.abs(v) < 1 ? "warning" : "danger";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cash up"
        subtitle="Count the drawer at close and reconcile it against today's takings."
      />

      {/* Today's settlement */}
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
        {/* Cash-up form */}
        <Card>
          <div className="space-y-4 p-4 sm:p-5">
            <SectionLabel>Count the drawer</SectionLabel>

            {loading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <>
                <div className="flex items-center justify-between rounded-lg border border-line bg-subtle px-3.5 py-2.5">
                  <span className="text-sm text-muted">Expected cash (till)</span>
                  <span className="tnum font-semibold text-ink">
                    {money(expectedCash)}
                  </span>
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
                      <span className="font-medium">Drawer balances exactly. 🎯</span>
                    ) : (
                      <span>
                        Drawer is{" "}
                        <strong>
                          {variance < 0 ? "short" : "over"} by {money(Math.abs(variance))}
                        </strong>{" "}
                        (counted {money(Number(counted) || 0)} − float{" "}
                        {money(Number(float) || 0)} − expected {money(expectedCash)}).
                      </span>
                    )}
                  </Alert>
                )}

                <Field label="Note (optional)">
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. £5 float short, made up from petty cash"
                  />
                </Field>

                <Button variant="primary" full loading={saving} onClick={save}>
                  Record cash-up
                </Button>
              </>
            )}
          </div>
        </Card>

        {/* History */}
        <Card>
          <div className="p-4 sm:p-5">
            <SectionLabel>Recent cash-ups</SectionLabel>
            {loading ? (
              <Skeleton className="mt-3 h-40 w-full" />
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
                    <Badge tone={varianceTone(h.variance)}>
                      {h.variance === 0
                        ? "Balanced"
                        : `${h.variance < 0 ? "−" : "+"}${money(Math.abs(h.variance)).replace(/^[^0-9-]*/, "")}`}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
