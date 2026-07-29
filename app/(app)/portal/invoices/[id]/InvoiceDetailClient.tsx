"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { money, BUSINESS } from "@/lib/business";
import {
  methodLabel,
  PAYMENT_METHODS,
  STATUS_LABEL,
  type InvoiceStatus,
  type PaymentMethod,
} from "@/lib/billing-shared";
import { segmentDef } from "@/lib/segments";
import type { InvoiceRecord } from "@/lib/billing";
import type { ProductRecord } from "@/lib/products";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  cx,
  Field,
  IconButton,
  Input,
  PageHeader,
  Select,
  Skeleton,
  Textarea,
  type Tone,
} from "@/components/ui/primitives";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

const STATUS_TONE: Record<InvoiceStatus, Tone> = {
  PAID: "success",
  UNPAID: "warning",
  DRAFT: "neutral",
  VOID: "danger",
};

type DraftLine = {
  key: string;
  productId: string | null;
  title: string;
  sku: string;
  quantity: number;
  unitPrice: number;
};

let seq = 1;

export default function InvoiceDetailClient({ id }: { id: string }) {
  const toast = useToast();
  const router = useRouter();

  const [invoice, setInvoice] = useState<InvoiceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [lines, setLines] = useState<DraftLine[]>([]);
  const [discount, setDiscount] = useState("0");
  const [notes, setNotes] = useState("");
  const [dirty, setDirty] = useState(false);

  const [payOpen, setPayOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/billing/${id}`, { cache: "no-store" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Could not open that invoice.");
    }
    const data = (await res.json()) as InvoiceRecord & { shareUrl?: string };
    setInvoice(data);
    setShareUrl(typeof data.shareUrl === "string" ? data.shareUrl : "");
    setLines(
      data.lines.map((l) => ({
        key: `k${seq++}`,
        productId: l.productId,
        title: l.title,
        sku: l.sku,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
      })),
    );
    setDiscount(String(data.totals.discount));
    setNotes(data.notes);
    setDirty(false);
    return data;
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

  /** Paid and voided invoices are read-only except for payments. */
  const editable = invoice?.status === "UNPAID" || invoice?.status === "DRAFT";

  const setLine = (key: string, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    setDirty(true);
  };

  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/billing/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: lines.map((l) => ({
            productId: l.productId,
            title: l.title,
            sku: l.sku,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
          })),
          discount: Number(discount) || 0,
          notes,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "That invoice was not saved.");
      setInvoice(body);
      setDirty(false);
      toast.success("Invoice saved.", "Stock has been adjusted to match.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const act = async (body: Record<string, unknown>, successMessage: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/billing/${id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That did not work.");

      if (body.action === "duplicate") {
        toast.success(`Copied to ${data.number}.`);
        router.push(`/portal/invoices/${data.id}`);
        return;
      }

      await load();
      toast.success(successMessage);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
      setPayOpen(false);
      setConfirmVoid(false);
    }
  };

  // Email the invoice PDF to the customer (or a typed address).
  const sendEmail = async () => {
    if (!invoice) return;
    const fallback = invoice.customer?.email || "";
    const to = window.prompt("Send this invoice to which email?", fallback);
    if (to === null) return;
    if (!to.trim()) {
      toast.error("Enter an email address to send to.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/email/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice.id, to: to.trim() }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "The invoice could not be emailed.");
      toast.success(`Invoice emailed to ${to.trim()}.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/billing/${id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "That invoice was not deleted.");
      toast.success("Invoice deleted and stock put back.");
      router.push("/portal/invoices");
    } catch (e) {
      toast.error((e as Error).message);
      setConfirmDelete(false);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <Alert tone="danger" title="Invoice not found">
        It may have been deleted. <Link href="/portal/invoices" className="underline">Back to invoices</Link>.
      </Alert>
    );
  }

  // Live totals while editing; the server recomputes on save.
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const disc = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  const net = subtotal - disc;
  const tax = invoice.taxable ? net * (invoice.taxRate / 100) : 0;
  const liveTotal = Math.round((net + tax) * 100) / 100;
  const balance = Math.round((liveTotal - invoice.totals.paid) * 100) / 100;

  const seg = segmentDef(invoice.segment);

  // WhatsApp click-to-send: opens WhatsApp with a prefilled message and the
  // customer's public invoice link. No API credentials needed.
  const custName = invoice.customer?.name || invoice.walkInName || "";
  const custPhone = (invoice.customer?.phone || invoice.walkInPhone || "").replace(/[^0-9]/g, "");
  const balanceDue = invoice.totals.balance;
  const absShare = shareUrl ? (typeof window !== "undefined" ? window.location.origin + shareUrl : shareUrl) : "";
  const waText = `Hi ${custName || "there"}, here is your invoice ${invoice.number} from ${BUSINESS.name} — total ${money(invoice.totals.total)}${balanceDue > 0.001 ? ` (${money(balanceDue)} due)` : " (paid)"}.${absShare ? ` View / download it here: ${absShare}` : ""}`;
  const waUrl = custPhone ? `https://wa.me/${custPhone}?text=${encodeURIComponent(waText)}` : null;

  return (
    <div>
      <PageHeader
        title={invoice.number}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[invoice.status]} dot>
              {STATUS_LABEL[invoice.status]}
            </Badge>
            {seg && (
              <span className={cx("rounded-md px-2 py-0.5 text-xs font-medium", seg.badge)}>
                {seg.label}
              </span>
            )}
            <span className="text-muted">
              {new Date(invoice.issuedAt).toLocaleString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {invoice.staffName && (
              <span className="text-muted">· by {invoice.staffName}</span>
            )}
          </span>
        }
        actions={
          <>
            <a href={`/api/public/invoice/${invoice.id}`} target="_blank" rel="noreferrer">
              <Button>Download PDF</Button>
            </a>
            {waUrl ? (
              <a href={waUrl} target="_blank" rel="noreferrer">
                <Button className="border-success/40 text-success hover:bg-success-subtle">
                  WhatsApp
                </Button>
              </a>
            ) : (
              <Button
                disabled
                title="Add a phone number to this customer to enable WhatsApp"
              >
                WhatsApp
              </Button>
            )}
            <Button onClick={sendEmail} loading={sending}>
              Email
            </Button>
            <Button
              onClick={() => act({ action: "duplicate" }, "Duplicated.")}
              disabled={saving}
            >
              Duplicate
            </Button>
            {editable && dirty && (
              <Button variant="primary" loading={saving} onClick={save}>
                Save changes
              </Button>
            )}
          </>
        }
      />

      {invoice.status === "VOID" && (
        <div className="mb-4">
          <Alert tone="danger" title="This invoice has been voided">
            Stock was put back and any payments against it were revoked. It is
            kept for the record and cannot be edited.
          </Alert>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        {/* Lines */}
        <div className="min-w-0 space-y-4">
          <Card padded={false}>
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">Items</h2>
              {editable && (
                <Button size="sm" onClick={() => setAddOpen(true)}>
                  Add item
                </Button>
              )}
            </div>

            <ul className="divide-y divide-line">
              {lines.map((l) => (
                <li key={l.key} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    {editable ? (
                      <input
                        value={l.title}
                        onChange={(e) => setLine(l.key, { title: e.target.value })}
                        className="w-full rounded border-0 bg-transparent p-0 text-sm font-medium text-ink focus:outline-none"
                        aria-label="Item description"
                      />
                    ) : (
                      <p className="truncate text-sm font-medium text-ink">{l.title}</p>
                    )}
                    <p className="truncate text-xs text-muted">
                      {l.sku || (l.productId ? "no SKU" : "custom item")}
                    </p>
                  </div>

                  {editable ? (
                    <>
                      <input
                        type="number"
                        min="1"
                        value={l.quantity}
                        onChange={(e) =>
                          setLine(l.key, {
                            quantity: Math.max(1, Number(e.target.value) || 1),
                          })
                        }
                        className="tnum h-8 w-14 rounded-lg border border-line bg-surface px-2 text-center text-sm focus:border-accent focus:outline-none"
                        aria-label="Quantity"
                      />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={l.unitPrice}
                        onChange={(e) =>
                          setLine(l.key, { unitPrice: Number(e.target.value) || 0 })
                        }
                        className="tnum h-8 w-20 rounded-lg border border-line bg-surface px-2 text-right text-sm focus:border-accent focus:outline-none"
                        aria-label="Unit price"
                      />
                    </>
                  ) : (
                    <>
                      <span className="tnum w-14 text-center text-sm text-muted">
                        ×{l.quantity}
                      </span>
                      <span className="tnum w-20 text-right text-sm text-muted">
                        {money(l.unitPrice)}
                      </span>
                    </>
                  )}

                  <span className="tnum w-20 text-right text-sm font-semibold text-ink">
                    {money(l.quantity * l.unitPrice)}
                  </span>

                  {editable && (
                    <IconButton
                      label="Remove line"
                      size="sm"
                      onClick={() => removeLine(l.key)}
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
                        <path d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </IconButton>
                  )}
                </li>
              ))}
            </ul>

            <div className="space-y-1.5 border-t border-line px-4 py-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Subtotal</span>
                <span className="tnum">{money(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Discount</span>
                {editable ? (
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={discount}
                    onChange={(e) => {
                      setDiscount(e.target.value);
                      setDirty(true);
                    }}
                    className="tnum h-8 w-24 rounded-lg border border-line bg-surface px-2 text-right text-sm focus:border-accent focus:outline-none"
                    aria-label="Discount"
                  />
                ) : (
                  <span className="tnum">{money(disc)}</span>
                )}
              </div>
              {invoice.taxable && (
                <div className="flex justify-between">
                  <span className="text-muted">Tax ({invoice.taxRate}%)</span>
                  <span className="tnum">{money(tax)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
                <span>Total</span>
                <span className="tnum">{money(liveTotal)}</span>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Notes" />
            <Textarea
              className="mt-2"
              rows={3}
              value={notes}
              disabled={!editable}
              onChange={(e) => {
                setNotes(e.target.value);
                setDirty(true);
              }}
              placeholder="Anything recorded against this bill"
            />
          </Card>
        </div>

        {/* Right rail */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="Billed to" />
            <div className="mt-2 text-sm">
              {invoice.customer ? (
                <Link
                  href={`/portal/customers/${invoice.customer.id}`}
                  className="font-medium text-ink hover:text-accent"
                >
                  {invoice.customer.name}
                </Link>
              ) : (
                <p className="font-medium text-ink">
                  {invoice.walkInName || "Walk-in customer"}
                </p>
              )}
              <p className="mt-0.5 text-muted">
                {invoice.customer?.company ||
                  invoice.customer?.phone ||
                  invoice.walkInPhone ||
                  "No contact details"}
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Payments"
              subtitle={
                balance > 0
                  ? `${money(balance)} still to pay`
                  : "Settled in full"
              }
            />

            <div className="mt-3 space-y-2">
              {invoice.status !== "VOID" && balance > 0 && (
                <>
                  <Button variant="primary" full onClick={() => setPayOpen(true)}>
                    Record a payment
                  </Button>
                  <Button
                    full
                    disabled={saving}
                    onClick={() =>
                      act(
                        { action: "pay-balance", method: "cash" },
                        "Balance settled.",
                      )
                    }
                  >
                    Pay balance in cash
                  </Button>
                </>
              )}
            </div>

            {invoice.payments.length > 0 && (
              <ul className="mt-3 divide-y divide-line border-t border-line pt-1">
                {invoice.payments.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-2 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="tnum font-medium text-ink">
                        {money(p.amount)}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {methodLabel(p.method)} ·{" "}
                        {new Date(p.takenAt).toLocaleDateString("en-GB")}
                        {p.note && ` · ${p.note}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() =>
                        act(
                          { action: "revoke-payment", paymentId: p.id },
                          "Payment revoked.",
                        )
                      }
                      className="shrink-0 text-xs font-medium text-muted hover:text-danger"
                    >
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Danger zone" />
            <div className="mt-3 space-y-2">
              {invoice.status !== "VOID" && (
                <Button
                  variant="danger"
                  full
                  disabled={saving}
                  onClick={() => setConfirmVoid(true)}
                >
                  Void this invoice
                </Button>
              )}
              {invoice.payments.length === 0 && (
                <Button
                  variant="outline"
                  full
                  disabled={saving}
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete permanently
                </Button>
              )}
            </div>
          </Card>
        </div>
      </div>

      <PaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        balance={balance}
        busy={saving}
        onConfirm={(amount, method, note) =>
          act({ action: "payment", amount, method, note }, "Payment recorded.")
        }
      />

      <AddLineModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={(line) => {
          setLines((prev) => [...prev, { ...line, key: `k${seq++}` }]);
          setDirty(true);
          setAddOpen(false);
        }}
      />

      <ConfirmDialog
        open={confirmVoid}
        onClose={() => setConfirmVoid(false)}
        onConfirm={() => act({ action: "void" }, "Invoice voided.")}
        busy={saving}
        title="Void this invoice?"
        confirmLabel="Void it"
        message="Stock goes back on the shelf and any payments recorded against it are revoked. The invoice is kept for the record but cannot be edited afterwards."
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        busy={saving}
        title="Delete this invoice?"
        confirmLabel="Delete"
        message="This removes it completely and puts the stock back. There will be no record that it existed. Voiding is usually the safer choice."
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function PaymentModal({
  open,
  onClose,
  balance,
  busy,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  balance: number;
  busy: boolean;
  onConfirm: (amount: number, method: PaymentMethod, note: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setAmount(String(balance > 0 ? balance : ""));
      setNote("");
    }
  }, [open, balance]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record a payment"
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
            Record
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
        <Field label="Note" hint="Optional — a cheque number, who paid, anything useful.">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function AddLineModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (line: Omit<DraftLine, "key">) => void;
}) {
  const [tab, setTab] = useState<"search" | "custom">("search");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ProductRecord[]>([]);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");

  useEffect(() => {
    if (!open || tab !== "search") return;
    const t = setTimeout(async () => {
      if (!q.trim()) return setResults([]);
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const d = (await res.json()) as { products: ProductRecord[] };
        setResults(d.products);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q, open, tab]);

  return (
    <Modal open={open} onClose={onClose} title="Add an item" size="sm">
      <div className="mb-3 flex gap-1 rounded-lg bg-subtle p-1">
        {(["search", "custom"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cx(
              "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === t ? "bg-surface text-ink shadow-sm" : "text-muted",
            )}
          >
            {t === "search" ? "From catalog" : "Custom line"}
          </button>
        ))}
      </div>

      {tab === "search" ? (
        <>
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or SKU"
          />
          <ul className="mt-3 max-h-64 divide-y divide-line overflow-y-auto">
            {results.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() =>
                    onAdd({
                      productId: p.id,
                      title: p.title,
                      sku: p.sku,
                      quantity: 1,
                      unitPrice: p.price,
                    })
                  }
                  className="flex w-full items-center justify-between gap-3 py-2.5 text-left hover:bg-subtle"
                >
                  <span className="min-w-0 truncate text-sm text-ink">
                    {p.title}
                  </span>
                  <span className="tnum shrink-0 text-sm font-medium">
                    {money(p.price)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="space-y-3">
          <Field label="Description" required>
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Delivery"
            />
          </Field>
          <Field label="Unit price" required>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </Field>
          <Button
            variant="primary"
            full
            disabled={!title.trim()}
            onClick={() =>
              onAdd({
                productId: null,
                title: title.trim(),
                sku: "",
                quantity: 1,
                unitPrice: Number(price) || 0,
              })
            }
          >
            Add line
          </Button>
        </div>
      )}
    </Modal>
  );
}
