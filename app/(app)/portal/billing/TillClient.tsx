"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { money } from "@/lib/business";
import { priceForContext, type TierPrices } from "@/lib/pricing";
import { SEGMENTS, type SegmentKey } from "@/lib/segments";
import {
  computeTotals,
  PAYMENT_METHODS,
  type PaymentMethod,
} from "@/lib/billing-shared";
import type { ProductRecord } from "@/lib/products";
import type { CustomerSummary } from "@/lib/customers";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  cx,
  Field,
  IconButton,
  Input,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import BarcodeScanner from "@/components/BarcodeScanner";

type CartLine = {
  /** Local row key — two lines can share a product after a manual split. */
  key: string;
  productId: string | null;
  title: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  /** Base price, kept so a Source change can re-price from the original. */
  basePrice: number;
  tiers: TierPrices;
  /** True once staff typed over the price — re-pricing must not undo that. */
  priceOverridden: boolean;
  stock: number | null;
};

let keySeq = 1;

export default function TillClient({
  taxRate,
  currency,
}: {
  taxRate: number;
  currency: string;
}) {
  const toast = useToast();
  const router = useRouter();

  const [lines, setLines] = useState<CartLine[]>([]);
  // Mode (the flow) and segment (the source/pricing channel) are independent —
  // a wholesale invoice can be recorded against any source, and changing the
  // Source never flips the mode.
  const [mode, setMode] = useState<"wholesale" | "pos">("wholesale");
  const [segment, setSegment] = useState<SegmentKey>("online");
  const [taxable, setTaxable] = useState(true);
  const [discount, setDiscount] = useState("");
  const [discountType, setDiscountType] = useState<"fixed" | "pct">("fixed");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("cash");
  const [received, setReceived] = useState("");
  const [notes, setNotes] = useState("");

  const [customer, setCustomer] = useState<CustomerSummary | null>(null);
  const [walkInName, setWalkInName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");

  // Running tab — a wholesale customer's still-open invoices from today that new
  // items can be appended to instead of starting a fresh bill.
  type OpenInvoice = { id: string; number: string; total: number; balance: number; issuedAt: string };
  const [openInvoices, setOpenInvoices] = useState<OpenInvoice[]>([]);
  const [addToInvoiceId, setAddToInvoiceId] = useState("");

  const [scanCode, setScanCode] = useState("");

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ProductRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const [scanOpen, setScanOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [done, setDone] = useState<{ id: string; number: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // The search box is where every sale starts, so it takes focus on load.
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Arriving from a customer page ("Bill this customer") pre-selects the account.
  useEffect(() => {
    const cid = new URLSearchParams(window.location.search).get("customer");
    if (!cid) return;
    fetch(`/api/customers/${cid}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((c: CustomerSummary | null) => {
        if (c && c.id) setCustomer(c);
      })
      .catch(() => {});
  }, []);

  // A wholesale customer's open invoices from today — the running tab. Loaded
  // whenever the selected account or the mode changes; cleared for POS.
  useEffect(() => {
    if (mode !== "wholesale" || !customer) {
      setOpenInvoices([]);
      setAddToInvoiceId("");
      return;
    }
    let alive = true;
    fetch(`/api/customers/${customer.id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((c: { invoices?: { id: string; number: string; status: string; issuedAt: string; total: number; balance: number }[] } | null) => {
        if (!alive || !c?.invoices) return;
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        setOpenInvoices(
          c.invoices
            .filter(
              (i) =>
                i.status !== "PAID" &&
                i.status !== "VOID" &&
                new Date(i.issuedAt) >= startOfToday,
            )
            .map((i) => ({ id: i.id, number: i.number, total: i.total, balance: i.balance, issuedAt: i.issuedAt })),
        );
        setAddToInvoiceId("");
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [customer, mode]);

  /* ---------------------------------------------------------------------- */
  /* Search                                                                  */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    const term = search.trim();
    if (!term) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/products/search?q=${encodeURIComponent(term)}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const data = (await res.json()) as { products: ProductRecord[] };
          setResults(data.products);
        }
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [search]);

  /* ---------------------------------------------------------------------- */
  /* Cart                                                                    */
  /* ---------------------------------------------------------------------- */

  // Wholesale pricing is driven by the MODE, not by whether a customer is
  // attached: a wholesale invoice uses the wholesale tier; POS uses the source
  // tier. Wholesale still beats the channel tier when both apply.
  const priceFor = useCallback(
    (base: number, tiers: TierPrices) =>
      priceForContext(base, tiers, {
        wholesale: mode === "wholesale",
        segment,
      }),
    [mode, segment],
  );

  const addProduct = useCallback(
    (p: ProductRecord) => {
      setLines((prev) => {
        // Same product scanned twice bumps the quantity rather than adding a
        // second row — unless staff have overridden that row's price, in which
        // case they meant them to be separate.
        const existing = prev.find(
          (l) => l.productId === p.id && !l.priceOverridden,
        );
        if (existing) {
          return prev.map((l) =>
            l.key === existing.key ? { ...l, quantity: l.quantity + 1 } : l,
          );
        }
        return [
          ...prev,
          {
            key: `k${keySeq++}`,
            productId: p.id,
            title: p.title,
            sku: p.sku,
            quantity: 1,
            unitPrice: priceFor(p.price, p.tiers),
            basePrice: p.price,
            tiers: p.tiers,
            priceOverridden: false,
            stock: p.stock,
          },
        ];
      });
      setSearch("");
      setResults([]);
      searchRef.current?.focus();
    },
    [priceFor],
  );

  /**
   * Re-price the cart when the Source changes. This is the point of the whole
   * tier system: switching from shop to eBay must reprice every catalog line
   * instantly. Manually overridden prices are left alone.
   */
  useEffect(() => {
    setLines((prev) =>
      prev.map((l) =>
        l.productId && !l.priceOverridden
          ? { ...l, unitPrice: priceFor(l.basePrice, l.tiers) }
          : l,
      ),
    );
  }, [priceFor]);

  const setLine = (key: string, patch: Partial<CartLine>) =>
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );

  const removeLine = (key: string) =>
    setLines((prev) => prev.filter((l) => l.key !== key));

  // Same function the server uses to total the saved invoice, so what staff
  // read out at the counter is exactly what gets charged.
  // A percentage discount is resolved to a cash amount before it reaches the
  // totals or the API — the server only ever stores a fixed amount.
  const subtotalRaw = useMemo(
    () => lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0),
    [lines],
  );
  const discountAmt = useMemo(() => {
    const n = Number(discount) || 0;
    if (n <= 0) return 0;
    return discountType === "pct"
      ? Math.round(subtotalRaw * Math.min(n, 100)) / 100
      : Math.min(n, subtotalRaw);
  }, [discount, discountType, subtotalRaw]);

  const totals = useMemo(
    () =>
      computeTotals({
        lines,
        discount: discountAmt,
        taxable,
        taxRate,
        paid: 0,
      }),
    [lines, discountAmt, taxable, taxRate],
  );

  /* ---------------------------------------------------------------------- */
  /* Scanning                                                                */
  /* ---------------------------------------------------------------------- */

  const handleScan = useCallback(
    async (code: string) => {
      try {
        const res = await fetch(
          `/api/barcodes/lookup?code=${encodeURIComponent(code)}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { product: ProductRecord | null };
        if (!data.product) {
          toast.error(`Nothing found for ${code}.`, "Check the code or search by name.");
          return;
        }
        addProduct(data.product);
        toast.success(`Added ${data.product.title}.`);
      } catch {
        toast.error("Could not look that barcode up.");
      }
    },
    [addProduct, toast],
  );

  /* ---------------------------------------------------------------------- */
  /* Completing                                                              */
  /* ---------------------------------------------------------------------- */

  const complete = async (
    payment: { amount: number; method: PaymentMethod } | null,
    override = false,
    surplus = 0,
  ) => {
    setBusy(true);
    try {
      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: lines.map((l) => ({
            productId: l.productId,
            title: l.title,
            sku: l.sku,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
          })),
          customerId: customer?.id ?? null,
          walkInName,
          walkInPhone,
          segment,
          taxable,
          discount: discountAmt,
          notes,
          payment,
          override,
        }),
      });

      const body = await res.json();

      // 409 = the sale would breach the customer's credit limit. Let the staff
      // member consciously override and resubmit, rather than blocking outright.
      if (res.status === 409 && !override) {
        setBusy(false);
        if (window.confirm(`${body.error}\n\nBill this customer anyway?`)) {
          await complete(payment, true, surplus);
        }
        return;
      }

      if (!res.ok) throw new Error(body.error ?? "That sale was not completed.");

      // Money received beyond this bill's total settles older invoices on the
      // account, oldest first — the double-counting guard from the reference.
      if (surplus > 0 && customer) {
        await fetch(`/api/customers/${customer.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "payment",
            amount: surplus,
            method: payMethod,
            note: `Overpayment on ${body.number}`,
          }),
        }).catch(() => {});
      }

      setDone({ id: body.id, number: body.number });
      setPayOpen(false);
      // Clear down ready for the next customer.
      setLines([]);
      setDiscount("");
      setReceived("");
      setNotes("");
      setCustomer(null);
      setWalkInName("");
      setWalkInPhone("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const empty = lines.length === 0;

  const clearBill = () => {
    setLines([]);
    setDiscount("");
    setReceived("");
    setNotes("");
    setCustomer(null);
    setWalkInName("");
    setWalkInPhone("");
    setAddToInvoiceId("");
  };

  // Running tab — append the cart onto an existing draft invoice rather than
  // raising a new one. Same-product lines merge by quantity; custom lines append.
  const addToOpenInvoice = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/billing/${encodeURIComponent(addToInvoiceId)}`, { cache: "no-store" });
      const inv = await res.json();
      if (!res.ok) throw new Error(inv.error ?? "Couldn't open that invoice.");

      const merged = (inv.lines as { productId: string | null; title: string; sku: string; quantity: number; unitPrice: number }[]).map(
        (l) => ({ productId: l.productId, title: l.title, sku: l.sku, quantity: l.quantity, unitPrice: Number(l.unitPrice) }),
      );
      for (const nl of lines) {
        const hit = nl.productId ? merged.find((m) => m.productId === nl.productId) : null;
        if (hit) hit.quantity += nl.quantity;
        else merged.push({ productId: nl.productId, title: nl.title, sku: nl.sku, quantity: nl.quantity, unitPrice: nl.unitPrice });
      }

      const upRes = await fetch(`/api/billing/${encodeURIComponent(addToInvoiceId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: merged, customerId: customer?.id ?? null, taxable, discount: discountAmt, notes, segment }),
      });
      const upd = await upRes.json();
      if (!upRes.ok) throw new Error(upd.error ?? "Couldn't add to the open invoice.");
      setDone({ id: upd.id, number: upd.number });
      clearBill();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Inline submit — no modal. POS completes immediately with the chosen method;
  // a wholesale invoice is a draft, optionally with money received on account.
  const submit = async () => {
    if (empty) return;
    // Wholesale invoices are for registered trade (seg:online) accounts, as in
    // the reference — otherwise steer the user to POS.
    if (mode === "wholesale") {
      if (!customer) {
        toast.error(
          "Wholesale invoices are for registered customers — pick a customer, or switch to POS for a walk-in.",
        );
        return;
      }
      if (!customer.segments.includes("online")) {
        toast.error(
          "Wholesale is for Online / Registered customers. Set this customer's segment to Online, or use POS.",
        );
        return;
      }
      // Running tab: fold these items into the chosen open invoice.
      if (addToInvoiceId) {
        await addToOpenInvoice();
        return;
      }
    }
    if (mode === "pos") {
      await complete({ amount: totals.total, method: payMethod });
      return;
    }
    const rec = Number(received) || 0;
    if (customer && rec > 0) {
      const applied = Math.min(rec, totals.total);
      const surplus = Math.max(0, Math.round((rec - totals.total) * 100) / 100);
      await complete(applied > 0 ? { amount: applied, method: payMethod } : null, false, surplus);
    } else {
      await complete(null);
    }
  };

  const oldOutstanding = customer?.outstanding ?? 0;
  const newOutstanding = Math.max(0, oldOutstanding + totals.total - (Number(received) || 0));

  return (
    <div>
      <PageHeader
        title="Billing / POS"
        actions={
          <div className="inline-flex items-center rounded-lg border border-line-strong bg-surface p-0.5">
            <button
              type="button"
              onClick={() => {
                setMode("wholesale");
                setSegment("online");
              }}
              className={cx(
                "rounded-md px-3.5 py-1.5 text-sm font-semibold transition-colors",
                mode === "wholesale" ? "bg-ink text-surface" : "text-ink-2 hover:bg-subtle",
              )}
            >
              Wholesale invoice
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("pos");
                setSegment("shop");
              }}
              className={cx(
                "rounded-md px-3.5 py-1.5 text-sm font-semibold transition-colors",
                mode === "pos" ? "bg-ink text-surface" : "text-ink-2 hover:bg-subtle",
              )}
            >
              POS (instant sale)
            </button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      {/* ---------------------------------------------------------------- */}
      {/* Left: search + cart                                              */}
      {/* ---------------------------------------------------------------- */}
      <div className="min-w-0">
        {/* Barcode bar — a USB / Bluetooth scanner types the code here and sends
            Enter, so a whole sale can be rung up without a mouse. The camera
            scanner lives in the search box for phones. */}
        <div className="mb-2">
          <Input
            value={scanCode}
            onChange={(e) => setScanCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const code = scanCode.trim();
                if (code) void handleScan(code);
                setScanCode("");
              }
            }}
            placeholder="Scan a barcode  ▏▎▍  (or type a code and press Enter)"
            aria-label="Scan barcode"
            className="h-10 font-mono text-sm"
          />
        </div>
        <div className="mb-3 flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                // Enter takes the top hit — the whole sale is completable
                // without touching the mouse.
                if (e.key === "Enter" && results[0]) {
                  e.preventDefault();
                  addProduct(results[0]);
                }
                if (e.key === "Escape") {
                  setSearch("");
                  setResults([]);
                }
              }}
              placeholder="Search a product, or scan — press Enter to add"
              className="h-12 pr-24 text-base"
              aria-label="Search products"
            />
            <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
              {searching && (
                <span className="text-xs text-faint">searching…</span>
              )}
              <IconButton
                label="Scan a barcode"
                size="sm"
                onClick={() => setScanOpen(true)}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.7}
                  strokeLinecap="round"
                  aria-hidden
                >
                  <path d="M4 7V5.5A1.5 1.5 0 0 1 5.5 4H7M17 4h1.5A1.5 1.5 0 0 1 20 5.5V7M20 17v1.5a1.5 1.5 0 0 1-1.5 1.5H17M7 20H5.5A1.5 1.5 0 0 1 4 18.5V17M7.5 8.5v7M11 8.5v7M14 8.5v7M16.5 8.5v7" />
                </svg>
              </IconButton>
            </div>
          </div>
          <Button size="lg" onClick={() => setCustomOpen(true)}>
            Custom item
          </Button>
        </div>

        {/* Search results */}
        {results.length > 0 && (
          <Card padded={false} className="mb-3 overflow-hidden">
            <ul className="max-h-72 divide-y divide-line overflow-y-auto">
              {results.map((p, i) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => addProduct(p)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-subtle"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-subtle">
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-[0.6rem] text-faint">—</span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        {p.title}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {p.sku || "no SKU"} · {p.stock} in stock
                      </span>
                    </span>
                    <span className="tnum shrink-0 text-sm font-semibold text-ink">
                      {money(priceFor(p.price, p.tiers), currency)}
                    </span>
                    {i === 0 && (
                      <kbd className="hidden rounded border border-line px-1.5 py-0.5 text-[0.6rem] text-faint sm:block">
                        ↵
                      </kbd>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Cart */}
        <Card padded={false} className="overflow-hidden">
          {empty ? (
            <div className="px-6 py-16 text-center">
              <p className="text-sm font-medium text-ink">Nothing on this bill yet</p>
              <p className="mx-auto mt-1 max-w-xs text-sm text-muted">
                Search for a product, scan a barcode, or add a custom item.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {lines.map((l) => (
                <li key={l.key} className="flex items-center gap-3 px-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {l.title}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {l.sku || (l.productId ? "no SKU" : "custom item")}
                      {l.stock !== null && l.quantity > l.stock && (
                        <span className="ml-1.5 text-warning">
                          only {l.stock} in stock
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Quantity stepper */}
                  <div className="flex items-center gap-0.5 rounded-lg border border-line">
                    <button
                      type="button"
                      aria-label="Reduce quantity"
                      onClick={() =>
                        l.quantity <= 1
                          ? removeLine(l.key)
                          : setLine(l.key, { quantity: l.quantity - 1 })
                      }
                      className="flex h-8 w-8 items-center justify-center text-muted transition-colors hover:bg-subtle hover:text-ink"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min="1"
                      value={l.quantity}
                      onChange={(e) =>
                        setLine(l.key, {
                          quantity: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                      className="tnum w-10 border-0 bg-transparent text-center text-sm focus:outline-none"
                      aria-label="Quantity"
                    />
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      onClick={() => setLine(l.key, { quantity: l.quantity + 1 })}
                      className="flex h-8 w-8 items-center justify-center text-muted transition-colors hover:bg-subtle hover:text-ink"
                    >
                      +
                    </button>
                  </div>

                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={l.unitPrice}
                    onChange={(e) =>
                      setLine(l.key, {
                        unitPrice: Number(e.target.value) || 0,
                        priceOverridden: true,
                      })
                    }
                    className="tnum h-8 w-20 rounded-lg border border-line bg-surface px-2 text-right text-sm focus:border-accent focus:outline-none"
                    aria-label={`Unit price for ${l.title}`}
                  />

                  <span className="tnum w-20 shrink-0 text-right text-sm font-semibold text-ink">
                    {money(l.quantity * l.unitPrice, currency)}
                  </span>

                  <IconButton
                    label={`Remove ${l.title}`}
                    size="sm"
                    onClick={() => removeLine(l.key)}
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Right: sale settings + totals                                    */}
      {/* ---------------------------------------------------------------- */}
      <div className="space-y-3">
        <Card>
          <Field
            label="Source"
            hint={
              mode === "wholesale"
                ? "Wholesale invoice — prices use the Wholesale tier. Blank tiers fall back to the base price."
                : `Prices use the ${SEGMENTS.find((s) => s.key === segment)?.label ?? segment} tier. Blank tiers fall back to the base price.`
            }
          >
            <Select
              value={segment}
              onChange={(e) => setSegment(e.target.value as SegmentKey)}
            >
              {SEGMENTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>

          <div className="mt-4">
            <p className="mb-1.5 text-xs font-medium text-ink-2">Customer</p>
            {customer ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-subtle px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {customer.name}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {customer.outstanding > 0
                      ? `${money(customer.outstanding, currency)} outstanding`
                      : "Account clear"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCustomer(null)}
                  className="shrink-0 text-xs font-medium text-muted hover:text-danger"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <Button full onClick={() => setCustomerOpen(true)}>
                  Find an account
                </Button>
                <Input
                  value={walkInName}
                  onChange={(e) => setWalkInName(e.target.value)}
                  placeholder="or walk-in name"
                />
                <Input
                  value={walkInPhone}
                  onChange={(e) => setWalkInPhone(e.target.value)}
                  placeholder="walk-in phone (optional)"
                />
              </div>
            )}
            {customer && (
              <p className="mt-1.5 text-xs text-accent">
                Trade pricing applied to this bill.
              </p>
            )}

            {/* Running tab — append to a draft invoice from earlier today. */}
            {mode === "wholesale" && customer && openInvoices.length > 0 && (
              <div className="mt-3 rounded-lg border border-info/40 bg-info-subtle/60 p-2.5">
                <p className="mb-1.5 text-xs font-medium text-ink-2">
                  {openInvoices.length} open invoice{openInvoices.length === 1 ? "" : "s"} from today —
                  add to a running tab, or start a new one.
                </p>
                <Select
                  value={addToInvoiceId}
                  onChange={(e) => setAddToInvoiceId(e.target.value)}
                  aria-label="Add to an open invoice"
                >
                  <option value="">➕ Create a new invoice</option>
                  {openInvoices.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.number} · {money(i.total, currency)}
                      {i.balance > 0.001 ? ` (${money(i.balance, currency)} due)` : ""}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="space-y-3">
            <Checkbox
              checked={taxable}
              onChange={setTaxable}
              label={`Charge VAT (${taxRate}%)`}
            />
            <Field label="Discount">
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  placeholder="0.00"
                  className="flex-1"
                />
                <div className="flex h-9 shrink-0 items-center rounded-md border border-line-strong bg-surface p-0.5">
                  {(["pct", "fixed"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setDiscountType(t)}
                      className={cx(
                        "rounded px-2.5 py-1 text-xs font-semibold transition-colors",
                        discountType === t ? "bg-ink text-surface" : "text-ink-2 hover:bg-subtle",
                      )}
                    >
                      {t === "pct" ? "%" : "£"}
                    </button>
                  ))}
                </div>
              </div>
              {discountAmt > 0 && (
                <p className="mt-1 text-xs text-muted">= {money(discountAmt, currency)} off</p>
              )}
            </Field>
            <Field label="Notes">
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything to record against this bill"
              />
            </Field>
          </div>
        </Card>

        <Card>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd className="tnum font-medium text-ink">
                {money(totals.subtotal, currency)}
              </dd>
            </div>
            {totals.discount > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted">Discount</dt>
                <dd className="tnum font-medium text-danger">
                  −{money(totals.discount, currency)}
                </dd>
              </div>
            )}
            {taxable && (
              <div className="flex justify-between">
                <dt className="text-muted">Tax</dt>
                <dd className="tnum font-medium text-ink">
                  {money(totals.tax, currency)}
                </dd>
              </div>
            )}
            <div className="flex justify-between border-t border-line pt-2 text-base">
              <dt className="font-semibold text-ink">Total</dt>
              <dd className="tnum font-semibold text-ink">
                {money(totals.total, currency)}
              </dd>
            </div>
          </dl>

          {/* How the sale was paid — POS completes on the spot. */}
          {mode === "pos" && (
            <div className="mt-4">
              <p className="mb-1.5 text-xs font-medium text-ink-2">Paid by</p>
              <div className="flex rounded-md border border-line-strong p-0.5">
                {(["cash", "card", "bank"] as PaymentMethod[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPayMethod(m)}
                    className={cx(
                      "flex-1 rounded px-2 py-1.5 text-xs font-semibold capitalize transition-colors",
                      payMethod === m ? "bg-ink text-surface" : "text-ink-2 hover:bg-subtle",
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Account panel — money can be taken against a registered account. */}
          {customer && (
            <div className="mt-4 space-y-2 rounded-lg border border-accent/40 bg-accent-subtle/60 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Old outstanding</span>
                <span className="tnum font-medium text-ink">{money(oldOutstanding, currency)}</span>
              </div>
              <div className="flex justify-between font-medium text-ink">
                <span>Total due</span>
                <span className="tnum">{money(oldOutstanding + totals.total, currency)}</span>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <span className="shrink-0 text-xs text-muted">Received £</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={received}
                  onChange={(e) => setReceived(e.target.value)}
                  placeholder="0.00"
                  className="h-8 w-24"
                />
                <button
                  type="button"
                  onClick={() => setReceived((oldOutstanding + totals.total).toFixed(2))}
                  className="text-xs font-medium text-accent hover:underline"
                >
                  pay all
                </button>
              </div>
              <div className="flex justify-between border-t border-accent/30 pt-2 text-base font-semibold">
                <span className="text-ink-2">New outstanding</span>
                <span className={cx("tnum", newOutstanding > 0 ? "text-danger" : "text-success")}>
                  {money(newOutstanding, currency)}
                </span>
              </div>
            </div>
          )}

          <Button
            variant="primary"
            size="lg"
            full
            className="mt-4"
            disabled={empty}
            loading={busy}
            onClick={submit}
          >
            {mode === "pos"
              ? `Charge ${money(totals.total, currency)} & complete`
              : addToInvoiceId
                ? `Add ${money(totals.total, currency)} to open invoice`
                : "Create invoice"}
          </Button>
          <p className="mt-2 text-xs text-faint">
            {mode === "pos"
              ? "Completes the sale immediately and deducts stock."
              : addToInvoiceId
                ? "Adds these items to the chosen invoice from today."
                : "Creates a draft invoice you can send or take payment on later."}
          </p>
        </Card>
      </div>

      {/* Modals -------------------------------------------------------- */}

      <BarcodeScanner
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onDetected={handleScan}
      />

      <CustomItemModal
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        onAdd={(title, price, qty) => {
          setLines((prev) => [
            ...prev,
            {
              key: `k${keySeq++}`,
              productId: null,
              title,
              sku: "",
              quantity: qty,
              unitPrice: price,
              basePrice: price,
              tiers: {},
              priceOverridden: true,
              stock: null,
            },
          ]);
          setCustomOpen(false);
        }}
      />

      <CustomerPicker
        open={customerOpen}
        onClose={() => setCustomerOpen(false)}
        onPick={(c) => {
          setCustomer(c);
          setCustomerOpen(false);
        }}
        currency={currency}
      />

      <PaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        total={totals.total}
        currency={currency}
        busy={busy}
        onConfirm={complete}
      />

      <Modal
        open={done !== null}
        onClose={() => setDone(null)}
        title="Sale complete"
        size="sm"
        footer={
          <>
            <Button onClick={() => setDone(null)}>New sale</Button>
            <Button
              variant="primary"
              onClick={() => router.push(`/portal/invoices/${done?.id}`)}
            >
              Open invoice
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">
          Invoice <span className="font-semibold text-ink">{done?.number}</span>{" "}
          has been raised and stock updated.
        </p>
      </Modal>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function CustomItemModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (title: string, price: number, qty: number) => void;
}) {
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("1");

  useEffect(() => {
    if (open) {
      setTitle("");
      setPrice("");
      setQty("1");
    }
  }, [open]);

  const valid = title.trim() !== "" && Number(price) >= 0 && Number(qty) >= 1;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a custom item"
      subtitle="For anything not in the catalog — a repair, a delivery charge, a one-off part."
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={() => onAdd(title.trim(), Number(price) || 0, Number(qty) || 1)}
          >
            Add to bill
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Description" required>
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Screen replacement — labour"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Unit price" required>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
            />
          </Field>
          <Field label="Quantity">
            <Input
              type="number"
              min="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function CustomerPicker({
  open,
  onClose,
  onPick,
  currency,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (c: CustomerSummary) => void;
  currency: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CustomerSummary[]>([]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      const res = await fetch(
        `/api/customers?search=${encodeURIComponent(q)}`,
        { cache: "no-store" },
      );
      if (res.ok) {
        const data = (await res.json()) as { customers: CustomerSummary[] };
        setResults(data.customers);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q, open]);

  return (
    <Modal open={open} onClose={onClose} title="Find an account" size="sm">
      <Input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Name, company or phone"
      />
      <ul className="mt-3 max-h-72 divide-y divide-line overflow-y-auto">
        {results.length === 0 ? (
          <li className="py-6 text-center text-sm text-muted">
            {q ? "No accounts matched." : "Start typing to search."}
          </li>
        ) : (
          results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onPick(c)}
                className="flex w-full items-center justify-between gap-3 px-1 py-2.5 text-left transition-colors hover:bg-subtle"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">
                    {c.name}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {c.company || c.phone || "—"}
                  </span>
                </span>
                {c.outstanding > 0 && (
                  <Badge tone="warning">
                    {money(c.outstanding, currency)} owed
                  </Badge>
                )}
              </button>
            </li>
          ))
        )}
      </ul>
    </Modal>
  );
}

function PaymentModal({
  open,
  onClose,
  total,
  currency,
  busy,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  total: number;
  currency: string;
  busy: boolean;
  onConfirm: (
    payment: { amount: number; method: PaymentMethod } | null,
  ) => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (open) setAmount(String(total));
  }, [open, total]);

  const paid = Number(amount) || 0;
  const remaining = Math.round((total - paid) * 100) / 100;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Take payment"
      subtitle={`${money(total, currency)} due`}
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
            onClick={() => onConfirm(paid > 0 ? { amount: paid, method } : null)}
          >
            {paid <= 0
              ? "Bill to account"
              : remaining > 0
                ? `Take ${money(paid, currency)}`
                : "Complete sale"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Method">
          <div className="grid grid-cols-2 gap-2">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMethod(m.key)}
                className={cx(
                  "rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                  method === m.key
                    ? "border-accent bg-accent-subtle text-accent"
                    : "border-line bg-surface text-ink-2 hover:bg-subtle",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </Field>

        <Field
          label="Amount received"
          hint="Leave less than the total to record a part payment."
        >
          <Input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-12 text-lg"
          />
        </Field>

        {remaining > 0 && paid > 0 && (
          <Alert tone="warning">
            {money(remaining, currency)} will stay outstanding on this invoice.
          </Alert>
        )}
        {remaining < 0 && (
          <Alert tone="info">
            {money(Math.abs(remaining), currency)} change due.
          </Alert>
        )}
        {paid <= 0 && (
          <Alert tone="info">
            No payment now — the full amount goes onto the account.
          </Alert>
        )}
      </div>
    </Modal>
  );
}
