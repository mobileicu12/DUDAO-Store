"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { money } from "@/lib/business";
import { cx } from "@/components/ui/primitives";
import { useCart } from "../CartContext";

type Me = { id: string; name: string; company: string } | null;
type Method = "cash" | "bank" | "account";

const OPTIONS: { key: Method; label: string; body: string }[] = [
  { key: "cash", label: "Cash on collection", body: "Pay in the shop when you collect. We'll have it ready." },
  { key: "bank", label: "Bank transfer", body: "We'll send bank details on the invoice; goods released on payment." },
  { key: "account", label: "On account", body: "Add to your trade account balance to settle later." },
];

export default function CheckoutPage() {
  const { items, subtotal, clear } = useCart();
  const router = useRouter();
  const [me, setMe] = useState<Me | undefined>(undefined);
  const [method, setMethod] = useState<Method>("bank");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<{ number: string; total: number } | null>(null);

  useEffect(() => {
    fetch("/api/shop/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { customer: null }))
      .then((d: { customer: Me }) => setMe(d.customer))
      .catch(() => setMe(null));
  }, []);

  const placeOrder = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/shop/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method,
          note,
          lines: items.map((i) => ({ productId: i.id, quantity: i.quantity })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        invoice?: { number: string; total: number };
      };
      if (!res.ok || !data.invoice) {
        setError(data.error ?? "Could not place the order.");
        return;
      }
      setPlaced({ number: data.invoice.number, total: data.invoice.total });
      clear();
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  if (placed) {
    return (
      <div className="mx-auto max-w-lg text-center">
        <div className="rounded-lg border border-accent/30 bg-accent-subtle p-8">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent text-xl text-accentfg">
            ✓
          </div>
          <h1 className="mt-4 text-xl font-semibold text-ink">Order placed</h1>
          <p className="mt-2 text-sm text-ink-2">
            Your order <span className="font-semibold">{placed.number}</span> for{" "}
            <span className="tnum font-semibold">{money(placed.total)}</span> is in. We&apos;ll
            prepare it and confirm. It appears on your account as an unpaid invoice.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Link href="/shop/account" className="flex h-10 items-center rounded-md bg-accent px-4 text-sm font-semibold text-accentfg hover:bg-accent-hover">
              View my orders
            </Link>
            <Link href="/shop" className="flex h-10 items-center rounded-md border border-line-strong bg-surface px-4 text-sm font-medium text-ink hover:bg-subtle">
              Keep shopping
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-lg text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Checkout</h1>
        <p className="mt-4 text-sm text-muted">Your basket is empty.</p>
        <Link href="/shop" className="mt-6 inline-flex h-10 items-center rounded-md bg-accent px-4 text-sm font-semibold text-accentfg hover:bg-accent-hover">
          Go to shop
        </Link>
      </div>
    );
  }

  // Signed out — must log in to place a trade order.
  if (me === null) {
    return (
      <div className="mx-auto max-w-lg text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Almost there</h1>
        <div className="mt-6 rounded-lg border border-line bg-surface p-8">
          <p className="text-sm font-semibold text-ink">🔒 Sign in to place your order</p>
          <p className="mt-1 text-sm text-muted">
            Trade orders are placed against your account. Your basket is saved.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Link href="/shop/trade-login" className="flex h-10 items-center rounded-md bg-accent px-4 text-sm font-semibold text-accentfg hover:bg-accent-hover">
              Trade login
            </Link>
            <Link href="/shop/register" className="flex h-10 items-center rounded-md border border-line-strong bg-surface px-4 text-sm font-medium text-ink hover:bg-subtle">
              Register
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-ink">Checkout</h1>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <div>
            <h2 className="mb-2 text-sm font-semibold text-ink">How would you like to pay?</h2>
            <div className="space-y-2">
              {OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setMethod(o.key)}
                  className={cx(
                    "flex w-full items-start gap-3 rounded-lg border p-3.5 text-left transition-colors",
                    method === o.key
                      ? "border-accent bg-accent-subtle"
                      : "border-line-strong bg-surface hover:bg-subtle",
                  )}
                >
                  <span
                    className={cx(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                      method === o.key ? "border-accent" : "border-line-strong",
                    )}
                  >
                    {method === o.key && <span className="h-2 w-2 rounded-full bg-accent" />}
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-ink">{o.label}</span>
                    <span className="mt-0.5 block text-xs text-muted">{o.body}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="note" className="mb-1.5 block text-sm font-semibold text-ink">
              Note (optional)
            </label>
            <textarea
              id="note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Collection time, delivery request…"
              className="w-full resize-y rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)]"
            />
          </div>
        </div>

        <aside className="h-fit rounded-lg border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold text-ink">Order summary</h2>
          <ul className="mt-3 space-y-2">
            {items.map((i) => (
              <li key={i.id} className="flex justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-ink-2">
                  {i.quantity} × {i.title}
                </span>
                <span className="tnum shrink-0 font-medium text-ink">
                  {money(i.price * i.quantity)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-between border-t border-line pt-3">
            <span className="text-sm font-medium text-ink">Subtotal</span>
            <span className="tnum text-base font-semibold text-ink">{money(subtotal)}</span>
          </div>

          {error && (
            <div className="mt-3 rounded-md bg-danger-subtle px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={placeOrder}
            disabled={busy || me === undefined}
            className="mt-4 flex h-11 w-full items-center justify-center rounded-md bg-accent text-sm font-semibold text-accentfg transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? "Placing order…" : "Place order"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/shop/cart")}
            className="mt-2 w-full text-center text-xs font-medium text-muted hover:text-ink"
          >
            Back to basket
          </button>
        </aside>
      </div>
    </div>
  );
}
