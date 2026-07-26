"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { money } from "@/lib/business";
import {
  methodLabel,
  PAYMENT_METHODS,
  STATUS_LABEL,
  type InvoiceStatus,
  type PaymentMethod,
} from "@/lib/billing-shared";
import { SEGMENTS, type SegmentKey } from "@/lib/segments";
import type { CustomerDetail } from "@/lib/customers";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  cx,
  Field,
  Input,
  PageHeader,
  Select,
  Skeleton,
  StatCard,
  Textarea,
} from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

export default function CustomerDetailClient({ id }: { id: string }) {
  const toast = useToast();

  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [methodFilter, setMethodFilter] = useState("all");

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
      setPayOpen(false);
    }
  };

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

  const ledger =
    methodFilter === "all"
      ? customer.ledger
      : customer.ledger.filter((p) => p.method === methodFilter);

  const overLimit =
    customer.creditLimit !== null && customer.outstanding > customer.creditLimit;

  return (
    <div>
      <PageHeader
        title={customer.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {customer.company && <span className="text-muted">{customer.company}</span>}
            {customer.segments.map((s) => {
              const def = SEGMENTS.find((x) => x.key === s);
              return def ? (
                <span
                  key={s}
                  className={cx("rounded-md px-2 py-0.5 text-xs font-medium", def.badge)}
                >
                  {def.label}
                </span>
              ) : null;
            })}
          </span>
        }
        actions={
          <>
            <Button onClick={() => setEditOpen(true)}>Edit details</Button>
            <Button variant="primary" onClick={() => setPayOpen(true)}>
              Take payment
            </Button>
          </>
        }
      />

      {overLimit && (
        <div className="mb-4">
          <Alert tone="danger" title="Over their credit limit">
            This account owes {money(customer.outstanding)} against a limit of{" "}
            {money(customer.creditLimit!)}.
          </Alert>
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total billed" value={money(customer.totalBilled)} />
        <StatCard label="Total paid" value={money(customer.totalPaid)} tone="success" />
        <StatCard
          label="Outstanding"
          value={
            customer.outstanding < 0
              ? `${money(Math.abs(customer.outstanding))} cr`
              : money(customer.outstanding)
          }
          tone={customer.outstanding > 0 ? "warning" : "success"}
        />
        <StatCard
          label="Opening balance"
          value={money(customer.openingBalance)}
          hint="Carried over from before"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-4">
          {/* Invoices */}
          <Card padded={false}>
            <div className="border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">Invoice history</h2>
            </div>
            {customer.invoices.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">
                No invoices yet.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {customer.invoices.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                    <Link
                      href={`/portal/invoices/${i.id}`}
                      className="min-w-0 flex-1 font-medium text-ink hover:text-accent"
                    >
                      {i.number}
                    </Link>
                    <Badge
                      tone={
                        i.status === "PAID"
                          ? "success"
                          : i.status === "VOID"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {STATUS_LABEL[i.status as InvoiceStatus] ?? i.status}
                    </Badge>
                    <span className="w-24 text-right text-xs text-muted">
                      {new Date(i.issuedAt).toLocaleDateString("en-GB")}
                    </span>
                    <span className="tnum w-20 text-right text-sm text-ink">
                      {money(i.total)}
                    </span>
                    <span
                      className={cx(
                        "tnum w-20 text-right text-sm font-medium",
                        i.balance > 0 ? "text-warning" : "text-muted",
                      )}
                    >
                      {money(i.balance)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Ledger */}
          <Card padded={false}>
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-ink">Payment ledger</h2>
                <p className="text-xs text-muted">
                  Revoked entries stay listed so corrections are visible.
                </p>
              </div>
              <Select
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
                className="h-8 w-auto text-xs"
                aria-label="Filter by method"
              >
                <option value="all">All methods</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </div>

            {ledger.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">
                No payments recorded.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {ledger.map((p) => (
                  <li
                    key={p.id}
                    className={cx(
                      "flex items-center gap-3 px-4 py-2.5",
                      p.revoked && "opacity-50",
                    )}
                  >
                    <span
                      className={cx(
                        "tnum w-24 font-medium",
                        p.revoked ? "text-muted line-through" : "text-success",
                      )}
                    >
                      {money(p.amount)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-muted">
                      {methodLabel(p.method)}
                      {p.invoiceNumber && ` · ${p.invoiceNumber}`}
                      {p.note && ` · ${p.note}`}
                    </span>
                    <span className="text-xs text-muted">
                      {new Date(p.takenAt).toLocaleDateString("en-GB")}
                    </span>
                    {!p.revoked && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          act(
                            { action: "revoke-payment", paymentId: p.id },
                            "Payment revoked.",
                          )
                        }
                        className="text-xs font-medium text-muted hover:text-danger"
                      >
                        Revoke
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Right rail */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="Contact" />
            <dl className="mt-2 space-y-1.5 text-sm">
              {[
                ["Phone", customer.phone],
                ["Email", customer.email],
                ["Address", [customer.address, customer.city, customer.postcode].filter(Boolean).join(", ")],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <dt className="shrink-0 text-muted">{label}</dt>
                  <dd className="min-w-0 truncate text-right text-ink">
                    {value || "—"}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <CardHeader
              title="Documents"
              subtitle="Signed links — no login needed to open them."
            />
            <div className="mt-3 space-y-2">
              <a
                href={`/api/public/statement/${customer.id}`}
                target="_blank"
                rel="noreferrer"
                className="block"
              >
                <Button full>Full statement PDF</Button>
              </a>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Trade code"
              subtitle="For trade pricing if you switch a storefront on later."
            />
            <div className="mt-3">
              {customer.tradeCode ? (
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-lg bg-subtle px-3 py-2 text-center font-mono text-sm tracking-widest text-ink">
                    {customer.tradeCode}
                  </code>
                  <Button
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(customer.tradeCode!);
                      toast.success("Code copied.");
                    }}
                  >
                    Copy
                  </Button>
                </div>
              ) : (
                <Button
                  full
                  disabled={busy}
                  onClick={() => act({ action: "trade-code" }, "Code issued.")}
                >
                  Generate a code
                </Button>
              )}
            </div>
          </Card>
        </div>
      </div>

      <AccountPaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        outstanding={customer.outstanding}
        busy={busy}
        onConfirm={(amount, method, note) =>
          act({ action: "payment", amount, method, note }, "Payment recorded.")
        }
      />

      <EditCustomerModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        customer={customer}
        onSaved={(updated) => {
          setCustomer((prev) => (prev ? { ...prev, ...updated } : prev));
          setEditOpen(false);
          void load();
        }}
      />
    </div>
  );
}

function AccountPaymentModal({
  open,
  onClose,
  outstanding,
  busy,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  outstanding: number;
  busy: boolean;
  onConfirm: (amount: number, method: PaymentMethod, note: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setAmount(outstanding > 0 ? String(outstanding) : "");
      setNote("");
    }
  }, [open, outstanding]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Take a payment"
      subtitle="Goes against the account balance rather than one invoice."
      size="sm"
      dismissable={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={() => onConfirm(Number(amount) || 0, method, note)}
          >
            Record payment
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Amount" required>
          <Input
            autoFocus
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-12 text-lg"
          />
        </Field>
        <Field label="Method">
          <Select
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Note">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function EditCustomerModal({
  open,
  onClose,
  customer,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  customer: CustomerDetail;
  onSaved: (updated: Partial<CustomerDetail>) => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({ ...customer });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setForm({ ...customer });
  }, [open, customer]);

  const set = (patch: Partial<CustomerDetail>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const submit = async () => {
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
          segments: form.segments,
          openingBalance: Number(form.openingBalance) || 0,
          creditLimit:
            form.creditLimit === null || String(form.creditLimit) === ""
              ? null
              : Number(form.creditLimit),
          notes: form.notes,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Those details were not saved.");
      toast.success("Customer updated.");
      onSaved(body);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit customer"
      size="md"
      dismissable={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" required className="sm:col-span-2">
          <Input value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Company">
          <Input value={form.company} onChange={(e) => set({ company: e.target.value })} />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
        </Field>
        <Field label="Email" className="sm:col-span-2">
          <Input value={form.email} onChange={(e) => set({ email: e.target.value })} />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <Input value={form.address} onChange={(e) => set({ address: e.target.value })} />
        </Field>
        <Field label="Town / city">
          <Input value={form.city} onChange={(e) => set({ city: e.target.value })} />
        </Field>
        <Field label="Postcode">
          <Input value={form.postcode} onChange={(e) => set({ postcode: e.target.value })} />
        </Field>
        <Field
          label="Opening balance"
          hint="Debt carried over from before this system."
        >
          <Input
            type="number"
            step="0.01"
            value={form.openingBalance}
            onChange={(e) => set({ openingBalance: Number(e.target.value) })}
          />
        </Field>
        <Field label="Credit limit" hint="Leave blank for no limit.">
          <Input
            type="number"
            step="0.01"
            value={form.creditLimit ?? ""}
            onChange={(e) =>
              set({
                creditLimit: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </Field>
        <Field label="Source" className="sm:col-span-2">
          <div className="flex flex-wrap gap-1.5">
            {SEGMENTS.map((s) => {
              const on = form.segments.includes(s.key);
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() =>
                    set({
                      segments: on
                        ? form.segments.filter((x) => x !== s.key)
                        : ([...form.segments, s.key] as SegmentKey[]),
                    })
                  }
                  className={cx(
                    "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                    on
                      ? "border-accent bg-accent-subtle text-accent"
                      : "border-line text-muted hover:bg-subtle",
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea
            rows={2}
            value={form.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </Field>
      </div>
    </Modal>
  );
}
