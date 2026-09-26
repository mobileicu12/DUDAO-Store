"use client";

import { useState } from "react";
import { money } from "@/lib/business";
import { cx } from "@/components/ui/primitives";
import { useCart } from "./CartContext";

type Variant = { id: string; title: string; sku: string; wholesale: number; stock: number };

/**
 * Buy box for a product that has variants. The customer picks a variant, which
 * sets the price and stock, then adds that specific variant to the basket (as a
 * distinct line, keyed productId:variantId). Prices are re-derived server-side
 * at checkout, so what's shown here is display only.
 */
export default function VariantBuyBox({
  product,
  variants,
}: {
  product: { id: string; title: string; imageUrl: string | null };
  variants: Variant[];
}) {
  const { add } = useCart();
  // Default to the first in-stock variant, else the first.
  const firstInStock = variants.find((v) => v.stock > 0) ?? variants[0];
  const [selectedId, setSelectedId] = useState(firstInStock?.id ?? "");
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const selected = variants.find((v) => v.id === selectedId) ?? firstInStock;
  const inStock = (selected?.stock ?? 0) > 0;

  const onAdd = () => {
    if (!selected || !inStock) return;
    add(
      {
        id: `${product.id}:${selected.id}`,
        productId: product.id,
        variantId: selected.id,
        variantTitle: selected.title,
        title: product.title,
        imageUrl: product.imageUrl,
        price: selected.wholesale,
      },
      qty,
    );
    setAdded(true);
    setTimeout(() => setAdded(false), 1400);
  };

  return (
    <>
      <p className="text-xs font-medium tracking-wide text-muted uppercase">
        Choose an option
      </p>
      <div className="mt-2 space-y-1.5">
        {variants.map((v) => {
          const on = v.id === selectedId;
          const out = v.stock <= 0;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setSelectedId(v.id)}
              disabled={out}
              className={cx(
                "flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                on ? "border-accent bg-accent-subtle" : "border-line-strong bg-surface hover:bg-subtle",
                out && "opacity-50",
              )}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{v.title}</span>
                <span className="block truncate text-xs text-muted">
                  {v.sku || "no SKU"} · {out ? "out of stock" : `${v.stock} in stock`}
                </span>
              </span>
              <span className="tnum shrink-0 font-semibold text-ink">{money(v.wholesale)}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-baseline justify-between">
        <p className="text-xs font-medium tracking-wide text-muted uppercase">Your wholesale price</p>
        <p className="tnum text-2xl font-semibold tracking-tight text-ink">
          {selected ? money(selected.wholesale) : "—"}
        </p>
      </div>

      <div className="mt-4 flex items-center gap-2">
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
        {inStock ? (
          <button
            type="button"
            onClick={onAdd}
            className="flex h-10 flex-1 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-accentfg transition-all hover:bg-accent-hover active:scale-[.985]"
          >
            {added ? "✓ Added" : "Add to basket"}
          </button>
        ) : (
          <span className="flex h-10 flex-1 items-center justify-center rounded-md border border-line bg-subtle px-4 text-sm font-medium text-muted">
            Out of stock
          </span>
        )}
      </div>
    </>
  );
}
