"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AUDIT_LABELS,
  AUDIT_CRITICAL,
  type AuditEntry,
} from "@/lib/audit-labels";
import {
  Alert,
  Badge,
  Button,
  Card,
  cx,
  EmptyState,
  Input,
  PageHeader,
  SectionLabel,
  Segmented,
  Select,
  Skeleton,
} from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

type DeletedInvoice = {
  id: string;
  invoiceNo: string;
  customer: string;
  total: string;
  createdAt: string;
};

const dt = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const actorLabel = (who: string) =>
  who === "master-password"
    ? "Owner (master)"
    : who === "unknown"
      ? "Unknown"
      : who;

export default function LogsClient() {
  const toast = useToast();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [deleted, setDeleted] = useState<DeletedInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [months, setMonths] = useState(3);
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"all" | "critical">("all");
  const [restoring, setRestoring] = useState<DeletedInvoice | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`/api/logs?months=${months}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not load the activity log.");
      setEntries(d.entries ?? []);
      setDeleted(d.deleted ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the activity log.");
    } finally {
      setLoading(false);
    }
  }, [months]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries.filter((e) => {
      if (only === "critical" && !AUDIT_CRITICAL.has(e.action)) return false;
      if (!needle) return true;
      const hay = `${AUDIT_LABELS[e.action] ?? e.action} ${e.name ?? ""} ${
        e.detail ?? ""
      } ${e.who}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [entries, q, only]);

  async function confirmRestore() {
    if (!restoring) return;
    setBusy(true);
    try {
      const r = await fetch("/api/logs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "restore", id: restoring.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Restore failed.");
      toast.success(`Invoice ${restoring.invoiceNo} restored.`);
      setRestoring(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Restore failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity log"
        subtitle="Every change to invoices and payments — who did it and when. Deleted invoices can be restored here."
      />

      {error && <Alert tone="danger">{error}</Alert>}

      {/* Recoverable deletions */}
      <Card>
        <div className="p-4 sm:p-5">
          <SectionLabel>Deleted invoices</SectionLabel>
          {loading ? (
            <Skeleton className="mt-3 h-16 w-full" />
          ) : deleted.length === 0 ? (
            <p className="mt-2 text-sm text-muted">
              Nothing to restore — no invoices have been deleted.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {deleted.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink">
                      {d.invoiceNo}{" "}
                      <span className="text-muted">· £{d.total}</span>
                    </p>
                    <p className="truncate text-sm text-muted">
                      {d.customer} · deleted {dt(d.createdAt)}
                    </p>
                  </div>
                  <Button variant="secondary" onClick={() => setRestoring(d)}>
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* The trail */}
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4 sm:p-5">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search the log…"
            className="min-w-[12rem] flex-1"
          />
          <Segmented
            value={only}
            onChange={setOnly}
            options={[
              { value: "all", label: "All" },
              { value: "critical", label: "Money-critical" },
            ]}
          />
          <Select
            value={String(months)}
            onChange={(e) => setMonths(Number(e.target.value))}
            className="w-auto"
          >
            <option value="1">Last month</option>
            <option value="3">Last 3 months</option>
            <option value="6">Last 6 months</option>
            <option value="12">Last 12 months</option>
          </Select>
          <Button variant="ghost" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2 p-4 sm:p-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Nothing here yet"
            message={
              entries.length === 0
                ? "Once invoices and payments are edited, the trail appears here."
                : "No entries match your search."
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {filtered.map((e, i) => {
              const critical = AUDIT_CRITICAL.has(e.action);
              return (
                <li
                  key={e.id ?? i}
                  className={cx(
                    "flex flex-wrap items-start justify-between gap-2 px-4 py-3 sm:px-5",
                    critical && "bg-danger-subtle",
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">
                        {AUDIT_LABELS[e.action] ?? e.action}
                      </span>
                      {e.name && <Badge tone="neutral">{e.name}</Badge>}
                      {critical && <Badge tone="danger">money</Badge>}
                    </div>
                    {e.detail && (
                      <p className="mt-0.5 text-sm text-muted">{e.detail}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right text-sm text-muted">
                    <div>{dt(e.at)}</div>
                    <div className="truncate">{actorLabel(e.who)}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={!!restoring}
        onClose={() => setRestoring(null)}
        onConfirm={confirmRestore}
        title="Restore invoice"
        confirmLabel="Restore"
        tone="primary"
        busy={busy}
        message={
          restoring ? (
            <>
              Restore invoice <strong>{restoring.invoiceNo}</strong> (£
              {restoring.total}) for {restoring.customer}? It will reappear in the
              invoice list, count towards balances again and re-deduct stock.
            </>
          ) : (
            ""
          )
        }
      />
    </div>
  );
}
