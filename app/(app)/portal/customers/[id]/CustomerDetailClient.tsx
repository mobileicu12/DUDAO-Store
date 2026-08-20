"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { money } from "@/lib/business";
import { downloadFile } from "@/lib/download";
import {
  methodLabel,
  PAYMENT_METHODS,
  statusView,
  type InvoiceStatus,
  type PaymentMethod,
} from "@/lib/billing-shared";
import { SEGMENTS, type SegmentKey } from "@/lib/segments";
import PdfPreviewModal from "@/components/PdfPreviewModal";
import FinanceRequestButton from "@/components/FinanceRequestButton";
import { useCanSeeFinance } from "@/lib/use-me";
import type { CustomerDetail } from "@/lib/customers";
import {
  Alert,
  Badge,
  Button,
  Card,
  cx,
  Input,
  Select,
  Skeleton,
  Textarea,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

const gbp = (n: number) => money(n);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

// Statement periods — same presets as the reference.
const PERIODS: { key: string; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "1m", label: "Last month" },
  { key: "3m", label: "Last 3 months" },
  { key: "6m", label: "Last 6 months" },
  { key: "1y", label: "Last year" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom range" },
];

function periodRange(key: string, from: string, to: string): { from: string; to: string; label: string } {
  const now = new Date();
  const end = new Date();
  let start = new Date();
  switch (key) {
    case "today": start = new Date(); break;
    case "7d": start.setDate(now.getDate() - 7); break;
    case "1m": start.setMonth(now.getMonth() - 1); break;
    case "3m": start.setMonth(now.getMonth() - 3); break;
    case "6m": start.setMonth(now.getMonth() - 6); break;
    case "1y": start.setFullYear(now.getFullYear() - 1); break;
    case "all": return { from: "", to: "", label: "All time" };
    case "custom": return { from, to, label: from && to ? `${from} → ${to}` : "Custom range" };
  }
  const f = ymd(start);
  const t = ymd(end);
  return { from: f, to: t, label: `${f} → ${t}` };
}

export default function CustomerDetailClient({ id }: { id: string }) {
  const toast = useToast();
  const router = useRouter();
  const canSeeFinance = useCanSeeFinance();

  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState("");
  const [editing, setEditing] = useState(false);

  const [invFilter, setInvFilter] = useState<"all" | "unpaid" | "paid">("all");
  const [invSort, setInvSort] = useState<"new" | "old" | "high">("new");
  const [invQ, setInvQ] = useState("");
  const [methodFilter, setMethodFilter] = useState("all");

  const [preview, setPreview] = useState<{ src: string; title: string; subtitle?: string; filename: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/customers/${id}`, { cache: "no-store" });
    if (!res.ok) {
      const b = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(b.error ?? "Could not open that customer.");
    }
    setCustomer((await res.json()) as CustomerDetail);
  }, [id]);

  useEffect(() => {
    let alive = true;
    load()
      .catch((e: Error) => alive && toast.error(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [load, toast]);

  // Ledger action (payment / revoke / method / reapply / trade-code).
  const act = async (body: Record<string, unknown>, message: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/customers/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That did not work.");
      if (body.action === "trade-code") {
        await load();
        toast.success(`Trade code ${data.code} issued.`);
      } else {
        setCustomer(data as CustomerDetail);
        toast.success(message);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Email + WhatsApp a document in one action, as the reference does.
  const sendDoc = async (kind: "statement" | "today", opts: { from?: string; to?: string } = {}) => {
    if (!customer) return;
    if (!customer.email && !customer.phone) {
      toast.error("No email or phone on file to send to.");
      return;
    }
    setSending(kind);
    const done: string[] = [];
    try {
      for (const channel of ["email", "whatsapp"] as const) {
        if (channel === "email" && !customer.email) continue;
        if (channel === "whatsapp" && !customer.phone) continue;
        const res = await fetch(`/api/customers/${id}/${kind}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel, ...opts }),
        });
        if (res.ok) done.push(channel === "email" ? "email" : "WhatsApp");
      }
      toast.success(
        done.length
          ? `${kind === "today" ? "Today's summary" : "Statement"} sent by ${done.join(" + ")}.`
          : "Nothing sent — email/WhatsApp may not be set up.",
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending("");
    }
  };

  const invoices = useMemo(() => {
    if (!customer) return [];
    return customer.invoices
      .filter((i) => {
        if (invFilter === "paid" && i.balance > 0.001) return false;
        if (invFilter === "unpaid" && i.balance <= 0.001) return false;
        if (invQ.trim()) return i.number.toLowerCase().includes(invQ.trim().toLowerCase());
        return true;
      })
      .sort((a, b) =>
        invSort === "high"
          ? b.total - a.total
          : invSort === "old"
            ? +new Date(a.issuedAt) - +new Date(b.issuedAt)
            : +new Date(b.issuedAt) - +new Date(a.issuedAt),
      );
  }, [customer, invFilter, invSort, invQ]);

  const ledger = useMemo(() => {
    if (!customer) return [];
    return methodFilter === "all"
      ? customer.ledger
      : customer.ledger.filter((p) => p.method === methodFilter);
  }, [customer, methodFilter]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (!customer) {
    return (
      <Alert tone="danger" title="Customer not found">
        <Link href="/portal/customers" className="underline">
          Back to customers
        </Link>
      </Alert>
    );
  }

  const c = customer;
  const outstanding = c.outstanding;
  const address = [c.address, c.city, c.postcode].filter(Boolean).join(", ");
  const isOnline = c.segments.includes("online");
  const receivedTotal = ledger.filter((p) => !p.revoked).reduce((s, p) => s + p.amount, 0);
  const accountCredit = c.ledger
    .filter((p) => !p.revoked && !p.invoiceNumber)
    .reduce((s, p) => s + p.amount, 0);
  const hasOpenBills = c.invoices.some((i) => i.status !== "VOID" && i.balance > 0.001);
  const methods = Array.from(new Set(c.ledger.map((p) => p.method)));

  const openPreview = (path: string, title: string, subtitle: string, filename: string) =>
    setPreview({ src: path, title, subtitle, filename });

  return (
    <div>
      <Link href="/portal/customers" className="text-sm text-muted hover:text-ink">
        ← Customers
      </Link>

      {/* Header ------------------------------------------------------------ */}
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-ink">{c.name || "(no name)"}</h1>
            {c.segments.map((s) => {
              const def = SEGMENTS.find((x) => x.key === s);
              return def ? (
                <span key={s} className={cx("rounded-md px-2 py-0.5 text-xs font-medium", def.badge)}>
                  {def.label}
                </span>
              ) : null;
            })}
          </div>
          <p className="mt-1 text-sm text-muted">
            {c.company && <span className="font-medium text-ink-2">{c.company} · </span>}
            {c.email || "no email"}
            {c.phone ? ` · ${c.phone}` : ""}
          </p>
          {address && <p className="mt-0.5 text-sm text-faint">{address}</p>}
          {c.openingBalance > 0 && (
            <p className="mt-0.5 text-xs text-accent">
              Opening balance brought forward: {gbp(c.openingBalance)}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setEditing((v) => !v)}>{editing ? "Close" : "Edit"}</Button>
          <Button
            onClick={() =>
              void downloadFile(`/api/customers/${id}/export`, "customer.xlsx").catch((e) =>
                toast.error(e instanceof Error ? e.message : "Export failed."),
              )
            }
          >
            Export data
          </Button>
          <Button
            disabled={c.invoices.length === 0 && c.openingBalance <= 0}
            onClick={() =>
              openPreview(
                `/api/public/statement/${id}`,
                `Statement — ${c.name}`,
                c.company || "",
                `statement-${c.name.replace(/[^a-z0-9]+/gi, "-")}.pdf`,
              )
            }
          >
            Statement
          </Button>
          <Button
            loading={sending === "statement"}
            disabled={c.invoices.length === 0 && c.openingBalance <= 0}
            onClick={() => sendDoc("statement")}
          >
            Send statement
          </Button>
          <Button
            onClick={() =>
              openPreview(
                `/api/customers/${id}/today`,
                `Today's statement — ${c.name}`,
                new Date().toLocaleDateString("en-GB"),
                `today-${c.name.replace(/[^a-z0-9]+/gi, "-")}.pdf`,
              )
            }
          >
            Today&apos;s statement
          </Button>
          <Button variant="primary" loading={sending === "today"} onClick={() => sendDoc("today")}>
            Send today
          </Button>
          {outstanding > 0.001 && (
            <Button
              onClick={() =>
                openPreview(
                  `/api/customers/${id}/outstanding-invoice`,
                  "Outstanding balance invoice",
                  `${gbp(outstanding)} due · ${c.name}`,
                  `outstanding-${c.name.replace(/[^a-z0-9]+/gi, "-")}.pdf`,
                )
              }
            >
              Invoice outstanding ({gbp(outstanding)})
            </Button>
          )}
          <Link
            href={`/portal/billing?customer=${id}`}
            className="inline-flex items-center rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-surface transition-colors hover:bg-accent hover:text-accentfg"
          >
            + New bill
          </Link>
        </div>
      </div>

      {editing && (
        <EditCard
          customer={c}
          onSaved={() => {
            setEditing(false);
            void load();
          }}
          onDeleted={() => router.push("/portal/customers")}
        />
      )}

      {/* Segment editor --------------------------------------------------- */}
      <SegmentEditor customerId={id} current={c.segments} onSaved={load} />

      {/* Trade code ------------------------------------------------------- */}
      {isOnline && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-subtle p-3">
          <span className="text-sm font-medium text-ink-2">🔑 Storefront trade code:</span>
          {c.tradeCode ? (
            <>
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(c.tradeCode!);
                  toast.success("Code copied.");
                }}
                className="rounded-lg border border-line bg-surface px-3 py-1 font-mono text-sm font-semibold tracking-widest text-ink"
                title="Copy"
              >
                {c.tradeCode}
              </button>
              <button
                onClick={() => act({ action: "trade-code" }, "Code issued.")}
                disabled={busy}
                className="text-xs text-muted hover:text-ink"
              >
                Regenerate
              </button>
            </>
          ) : (
            <Button size="sm" disabled={busy} onClick={() => act({ action: "trade-code" }, "Code issued.")}>
              Generate code
            </Button>
          )}
          <span className="text-xs text-faint">
            Give this to the customer — they log in with their email + this code to see wholesale prices online.
          </span>
        </div>
      )}

      {outstanding > 0 && c.creditLimit !== null && outstanding > c.creditLimit && (
        <div className="mt-4">
          <Alert tone="danger" title="Over their credit limit">
            This account owes {gbp(outstanding)} against a limit of {gbp(c.creditLimit)}.
          </Alert>
        </div>
      )}

      {/* Stats — billed / paid are finance-gated, as in the reference. ----- */}
      {!canSeeFinance && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-subtle px-4 py-2.5">
          <span className="text-xs text-muted">This customer&apos;s billed / paid totals are hidden.</span>
          <FinanceRequestButton />
        </div>
      )}
      <div className={cx("mt-6 grid grid-cols-2 gap-4", canSeeFinance ? "lg:grid-cols-4" : "lg:grid-cols-2")}>
        {canSeeFinance && <Stat label="Total billed" value={gbp(c.openingBalance + c.totalBilled)} />}
        {canSeeFinance && <Stat label="Total paid" value={gbp(c.totalPaid)} tone="success" />}
        <Stat
          label={outstanding < -0.001 ? "Account credit" : "Outstanding"}
          value={gbp(Math.abs(outstanding))}
          tone={outstanding > 0.001 ? "danger" : "success"}
        />
        <Stat label="Invoices" value={String(c.invoiceCount)} />
      </div>

      {/* Period statement ------------------------------------------------- */}
      <PeriodStatementCard id={id} onPreview={openPreview} onSend={sendDoc} sending={sending === "statement"} name={c.name} />

      {/* Invoices + payments --------------------------------------------- */}
      <div className="mt-7 grid gap-5 lg:grid-cols-2">
        {/* Invoices */}
        <Card padded={false} className="flex max-h-[520px] flex-col">
          <div className="border-b border-line p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-ink">
                Invoices <span className="text-sm font-normal text-faint">({invoices.length})</span>
              </h2>
              <Link
                href={`/portal/billing?customer=${id}`}
                className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-surface transition-colors hover:bg-accent hover:text-accentfg"
              >
                + New
              </Link>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-line-strong p-0.5">
                {(["all", "unpaid", "paid"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setInvFilter(f)}
                    className={cx(
                      "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                      invFilter === f ? "bg-ink text-surface" : "text-ink-2 hover:bg-subtle",
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <Select
                value={invSort}
                onChange={(e) => setInvSort(e.target.value as "new" | "old" | "high")}
                className="h-8 w-auto text-xs"
                aria-label="Sort invoices"
              >
                <option value="new">Newest</option>
                <option value="old">Oldest</option>
                <option value="high">Highest £</option>
              </Select>
              <Input
                value={invQ}
                onChange={(e) => setInvQ(e.target.value)}
                placeholder="Search #"
                className="h-8 w-24 flex-1 text-xs"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 divide-y divide-line overflow-y-auto px-4">
            {invoices.map((i) => {
              const sv = statusView(i.status as InvoiceStatus, i.paid, i.balance);
              return (
                <Link
                  key={i.id}
                  href={`/portal/invoices/${i.id}`}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm hover:bg-subtle"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{i.number}</p>
                    <p className="text-xs text-muted">
                      {new Date(i.issuedAt).toLocaleDateString("en-GB")} · <Badge tone={sv.tone}>{sv.label}</Badge>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tnum font-medium text-ink">{gbp(i.total)}</p>
                    {i.balance > 0.001 ? (
                      <p className="tnum text-xs text-warning">{gbp(i.balance)} due</p>
                    ) : i.paid > 0 ? (
                      <p className="text-xs text-success">paid</p>
                    ) : null}
                  </div>
                </Link>
              );
            })}
            {invoices.length === 0 && (
              <p className="py-6 text-center text-sm text-muted">
                {c.invoices.length === 0 ? "No invoices yet." : "None match this filter."}
              </p>
            )}
          </div>
        </Card>

        {/* Payments */}
        <Card padded={false} className="flex max-h-[520px] flex-col">
          <div className="border-b border-line p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-ink">Payment history</h2>
              <span className="rounded-lg bg-success-subtle px-2.5 py-1 text-xs font-semibold text-success">
                Received {gbp(receivedTotal)}
              </span>
            </div>
            {accountCredit > 0.001 && hasOpenBills && (
              <button
                onClick={() => act({ action: "reapply-credit" }, "Account credit re-applied to open bills.")}
                disabled={busy}
                className="mt-2 rounded-lg border border-accent/40 bg-accent-subtle px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent-subtle/70"
              >
                ↻ Re-apply {gbp(accountCredit)} credit to bills
              </button>
            )}
            {methods.length > 1 && (
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <button
                  onClick={() => setMethodFilter("all")}
                  className={cx(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    methodFilter === "all" ? "bg-ink text-surface" : "border border-line text-ink-2 hover:bg-subtle",
                  )}
                >
                  All
                </button>
                {methods.map((m) => (
                  <button
                    key={m}
                    onClick={() => setMethodFilter(m)}
                    className={cx(
                      "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                      methodFilter === m ? "bg-ink text-surface" : "border border-line text-ink-2 hover:bg-subtle",
                    )}
                  >
                    {methodLabel(m)}
                  </button>
                ))}
              </div>
            )}
            <RecordPayment id={id} outstanding={outstanding} busy={busy} onRecord={act} />
          </div>
          <div className="min-h-0 flex-1 divide-y divide-line overflow-y-auto px-4">
            {ledger.map((p) => (
              <div
                key={p.id}
                className={cx("flex items-center justify-between gap-2 py-2.5 text-sm", p.revoked && "opacity-50")}
              >
                <div className="min-w-0">
                  <p className={cx("tnum font-medium", p.revoked ? "text-muted line-through" : "text-success")}>
                    {gbp(p.amount)} <span className="font-normal text-muted">· {methodLabel(p.method)}</span>
                  </p>
                  <p className="truncate text-xs text-muted">
                    {new Date(p.takenAt).toLocaleDateString("en-GB")}
                    {p.invoiceNumber ? ` · ${p.invoiceNumber}` : " · On account"}
                    {p.note ? ` · ${p.note}` : ""}
                  </p>
                </div>
                {!p.revoked &&
                  (p.invoiceNumber ? (
                    <span className="shrink-0 rounded-md bg-success-subtle px-2 py-1 text-xs font-medium text-success">
                      on bill
                    </span>
                  ) : (
                    <div className="flex shrink-0 items-center gap-2 text-xs">
                      <select
                        value={p.method}
                        disabled={busy}
                        onChange={(e) =>
                          act(
                            { action: "set-payment-method", paymentId: p.id, method: e.target.value as PaymentMethod },
                            "Payment method corrected.",
                          )
                        }
                        className="rounded-md border border-line bg-surface px-1.5 py-0.5 text-xs text-ink-2"
                        title="Correct how this payment was taken"
                        aria-label="Correct payment method"
                      >
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m.key} value={m.key}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                      <a
                        href={`/api/customers/${id}/receipt?paymentId=${p.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-muted hover:text-accent"
                      >
                        Receipt
                      </a>
                      <button
                        onClick={() => act({ action: "revoke-payment", paymentId: p.id }, "Payment revoked.")}
                        disabled={busy}
                        className="font-medium text-muted hover:text-danger"
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
              </div>
            ))}
            {ledger.length === 0 && (
              <p className="py-6 text-center text-sm text-muted">
                {c.ledger.length === 0 ? "No payments recorded." : "None match this filter."}
              </p>
            )}
          </div>
        </Card>
      </div>

      {preview && (
        <PdfPreviewModal
          src={preview.src}
          title={preview.title}
          subtitle={preview.subtitle}
          filename={preview.filename}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Stat({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" }) {
  const color = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-ink";
  return (
    <Card>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={cx("tnum mt-2 text-2xl font-semibold", color)}>{value}</p>
    </Card>
  );
}

function SegmentEditor({
  customerId,
  current,
  onSaved,
}: {
  customerId: string;
  current: SegmentKey[];
  onSaved: () => void | Promise<void>;
}) {
  const toast = useToast();
  const [sel, setSel] = useState<SegmentKey[]>(current);
  const [saving, setSaving] = useState(false);
  useEffect(() => setSel(current), [current]);

  const changed = sel.slice().sort().join(",") !== current.slice().sort().join(",");
  const toggle = (k: SegmentKey) =>
    setSel((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segments: sel }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success("Segments saved.");
      await onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3">
      <span className="text-sm font-medium text-ink-2">Segment:</span>
      {SEGMENTS.map((s) => (
        <button
          key={s.key}
          onClick={() => toggle(s.key)}
          title={s.description}
          className={cx(
            "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
            sel.includes(s.key) ? "border-accent bg-accent-subtle text-accent" : "border-line text-muted hover:bg-subtle",
          )}
        >
          {sel.includes(s.key) ? "✓ " : ""}
          {s.label}
        </button>
      ))}
      {changed && (
        <Button size="sm" loading={saving} onClick={save}>
          Save
        </Button>
      )}
    </div>
  );
}

function PeriodStatementCard({
  id,
  name,
  onPreview,
  onSend,
  sending,
}: {
  id: string;
  name: string;
  onPreview: (path: string, title: string, subtitle: string, filename: string) => void;
  onSend: (kind: "statement", opts: { from?: string; to?: string }) => void;
  sending: boolean;
}) {
  const [period, setPeriod] = useState("1m");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const range = periodRange(period, from, to);
  const qs = range.from && range.to ? `?from=${range.from}&to=${range.to}` : "";

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-4">
      <span className="text-sm font-semibold text-ink">📄 Account statement for period:</span>
      <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="h-9 w-auto">
        {PERIODS.map((p) => (
          <option key={p.key} value={p.key}>
            {p.label}
          </option>
        ))}
      </Select>
      {period === "custom" && (
        <>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-auto" />
          <span className="text-sm text-faint">→</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-auto" />
        </>
      )}
      <Button
        onClick={() =>
          onPreview(
            `/api/public/statement/${id}${qs}`,
            `Statement — ${name}`,
            range.label,
            `statement-${name.replace(/[^a-z0-9]+/gi, "-")}.pdf`,
          )
        }
      >
        Preview / download
      </Button>
      <Button
        variant="primary"
        loading={sending}
        onClick={() => onSend("statement", { from: range.from || undefined, to: range.to || undefined })}
      >
        Send
      </Button>
    </div>
  );
}

function RecordPayment({
  id,
  outstanding,
  busy,
  onRecord,
}: {
  id: string;
  outstanding: number;
  busy: boolean;
  onRecord: (body: Record<string, unknown>, message: string) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");

  const save = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) return;
    await onRecord({ action: "payment", amount: amt, method, note }, "Payment recorded.");
    setAmount("");
    setNote("");
  };

  return (
    <div className="mt-3 rounded-xl bg-subtle p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="number"
          step="0.01"
          min="0"
          placeholder="Amount £"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="h-9 w-28"
        />
        <Select
          value={method}
          onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          className="h-9 w-auto"
          aria-label="Payment method"
        >
          {PAYMENT_METHODS.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </Select>
        <Input
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="h-9 flex-1"
        />
        <Button variant="primary" loading={busy} disabled={!amount} onClick={save}>
          Record payment
        </Button>
      </div>
      {outstanding > 0 && (
        <button
          onClick={() => setAmount(outstanding.toFixed(2))}
          className="mt-2 text-xs text-accent hover:underline"
        >
          Pay full outstanding ({gbp(outstanding)})
        </button>
      )}
    </div>
  );
}

function EditCard({
  customer,
  onSaved,
  onDeleted,
}: {
  customer: CustomerDetail;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({ ...customer });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<CustomerDetail>) => setForm((prev) => ({ ...prev, ...patch }));

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          company: form.company,
          email: form.email,
          phone: form.phone,
          address: form.address,
          city: form.city,
          postcode: form.postcode,
          openingBalance: Number(form.openingBalance) || 0,
          creditLimit:
            form.creditLimit === null || String(form.creditLimit) === "" ? null : Number(form.creditLimit),
          notes: form.notes,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Those details were not saved.");
      toast.success("Customer updated.");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (
      !window.confirm(
        `Remove ${customer.company || customer.name}? Customers with invoice history are kept automatically.`,
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch(`/api/customers/${customer.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "That customer was not removed.");
      toast.success("Customer removed.");
      onDeleted();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink-2">{label}</span>
      {children}
    </label>
  );

  return (
    <Card className="mt-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Edit customer</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <F label="Name">
          <Input value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </F>
        <F label="Company">
          <Input value={form.company} onChange={(e) => set({ company: e.target.value })} />
        </F>
        <F label="Email">
          <Input value={form.email} onChange={(e) => set({ email: e.target.value })} />
        </F>
        <F label="Phone">
          <Input value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
        </F>
        <F label="Address">
          <Input value={form.address} onChange={(e) => set({ address: e.target.value })} />
        </F>
        <div className="grid grid-cols-2 gap-3">
          <F label="Town / city">
            <Input value={form.city} onChange={(e) => set({ city: e.target.value })} />
          </F>
          <F label="Postcode">
            <Input value={form.postcode} onChange={(e) => set({ postcode: e.target.value })} />
          </F>
        </div>
        <F label="Opening balance (£)">
          <Input
            type="number"
            step="0.01"
            value={form.openingBalance}
            onChange={(e) => set({ openingBalance: Number(e.target.value) })}
          />
        </F>
        <F label="Credit limit (£)">
          <Input
            type="number"
            step="0.01"
            value={form.creditLimit ?? ""}
            onChange={(e) => set({ creditLimit: e.target.value === "" ? null : Number(e.target.value) })}
          />
        </F>
        <div className="sm:col-span-2">
          <F label="Notes">
            <Textarea rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
          </F>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Button variant="primary" loading={busy} onClick={save}>
          Save changes
        </Button>
        <Button variant="danger" disabled={busy} onClick={remove} className="ml-auto">
          Delete customer
        </Button>
      </div>
    </Card>
  );
}
