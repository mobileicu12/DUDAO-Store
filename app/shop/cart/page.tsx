"use client";

import Link from "next/link";
import { money } from "@/lib/business";
import { useCart } from "../CartContext";

export default function CartPage() {
  const { items, subtotal, setQty, remove } = useCart();

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-lg text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Your basket</h1>
        <div className="mt-6 rounded-lg border border-line bg-surface px-6 py-16">
          <span className="text-4xl">🧺</span>
          <p className="mt-3 text-sm font-semibold text-ink">Your basket is empty</p>
          <p className="mt-1 text-sm text-muted">Browse the catalogue to add items.</p>
          <Link
            href="/shop"
            className="mt-6 inline-flex h-10 items-center rounded-md bg-accent px-4 text-sm font-semibold text-accentfg hover:bg-accent-hover"
          >
            Go to shop
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-ink">Your basket</h1>

      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <ul className="divide-y divide-line">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-subtle">
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-2xl text-faint">📦</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{item.title}</p>
                <p className="tnum mt-0.5 text-xs text-muted">{money(item.price)} each</p>
              </div>
              <div className="flex h-9 items-center rounded-md border border-line-strong bg-surface">
                <button
                  type="button"
                  onClick={() => setQty(item.id, item.quantity - 1)}
                  className="flex h-full w-8 items-center justify-center text-muted hover:text-ink"
                  aria-label="Decrease"
                >
                  −
                </button>
                <span className="tnum w-8 text-center text-sm font-medium text-ink">
                  {item.quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQty(item.id, item.quantity + 1)}
                  className="flex h-full w-8 items-center justify-center text-muted hover:text-ink"
                  aria-label="Increase"
                >
                  +
                </button>
              </div>
              <p className="tnum w-20 shrink-0 text-right text-sm font-semibold text-ink">
                {money(item.price * item.quantity)}
              </p>
              <button
                type="button"
                onClick={() => remove(item.id)}
                className="shrink-0 text-muted hover:text-danger"
                aria-label={`Remove ${item.title}`}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6 flex flex-col items-end gap-4">
        <div className="flex w-full items-center justify-between sm:w-64">
          <span className="text-sm text-muted">Subtotal</span>
          <span className="tnum text-lg font-semibold text-ink">{money(subtotal)}</span>
        </div>
        <p className="text-xs text-muted">
          VAT and any settlement terms are confirmed on your invoice.
        </p>
        <div className="flex gap-2">
          <Link
            href="/shop"
            className="flex h-10 items-center rounded-md border border-line-strong bg-surface px-4 text-sm font-medium text-ink hover:bg-subtle"
          >
            Keep shopping
          </Link>
          <Link
            href="/shop/checkout"
            className="flex h-10 items-center rounded-md bg-accent px-5 text-sm font-semibold text-accentfg hover:bg-accent-hover"
          >
            Checkout
          </Link>
        </div>
      </div>
    </div>
  );
}
