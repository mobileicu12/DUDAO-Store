"use client";

import { useState } from "react";
import Link from "next/link";
import { useCart } from "./CartContext";

type Props = {
  product: { id: string; title: string; imageUrl: string | null; price: number };
  isTrade: boolean;
  inStock: boolean;
  withQty?: boolean;
};

/**
 * The single control that both gates price and adds to the basket. Logged-out
 * visitors see "Log in to buy"; approved trade customers get a real button.
 */
export default function AddToCart({ product, isTrade, inStock, withQty = false }: Props) {
  const { add } = useCart();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  if (!isTrade) {
    return (
      <Link
        href="/shop/trade-login"
        className="flex h-10 items-center justify-center rounded-md border border-line-strong bg-surface px-4 text-sm font-medium text-ink-2 transition-colors hover:bg-subtle"
      >
        🔒 Log in to buy
      </Link>
    );
  }

  if (!inStock) {
    return (
      <span className="flex h-10 items-center justify-center rounded-md border border-line bg-subtle px-4 text-sm font-medium text-muted">
        Out of stock
      </span>
    );
  }

  const onAdd = () => {
    add({ id: product.id, title: product.title, imageUrl: product.imageUrl, price: product.price }, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 1400);
  };

  return (
    <div className="flex items-center gap-2">
      {withQty && (
        <div className="flex h-10 items-center rounded-md border border-line-strong bg-surface">
          <button
            type="button"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            className="flex h-full w-9 items-center justify-center text-muted hover:text-ink"
            aria-label="Decrease quantity"
          >
            −
          </button>
          <span className="tnum w-8 text-center text-sm font-medium text-ink">{qty}</span>
          <button
            type="button"
            onClick={() => setQty((q) => q + 1)}
            className="flex h-full w-9 items-center justify-center text-muted hover:text-ink"
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={onAdd}
        className="flex h-10 flex-1 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-accentfg transition-all hover:bg-accent-hover active:scale-[.985]"
      >
        {added ? "✓ Added" : "Add to basket"}
      </button>
    </div>
  );
}
