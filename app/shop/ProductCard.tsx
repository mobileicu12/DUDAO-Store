import Link from "next/link";
import { money } from "@/lib/business";
import { wholesalePrice } from "@/lib/storefront";
import type { ProductRecord } from "@/lib/products";
import AddToCart from "./AddToCart";

/**
 * Storefront product tile — image, title, trade price (or a login lock) and an
 * add-to-cart button. Shared by the catalogue and every collection page so they
 * can never drift apart.
 */
export default function ProductCard({
  product: p,
  isTrade,
}: {
  product: ProductRecord;
  isTrade: boolean;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-sm transition-colors hover:border-line-strong">
      <Link
        href={`/shop/product/${p.id}`}
        className="flex aspect-square items-center justify-center overflow-hidden bg-subtle"
      >
        {p.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imageUrl} alt={p.title} className="h-full w-full object-cover" />
        ) : (
          <span className="text-3xl text-faint">📦</span>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <Link href={`/shop/product/${p.id}`} className="min-h-10">
          <p className="line-clamp-2 text-sm font-medium text-ink hover:text-accent">
            {p.title}
          </p>
        </Link>
        <div className="mt-auto">
          {isTrade ? (
            <p className="tnum text-base font-semibold text-ink">
              {money(wholesalePrice(p))}
            </p>
          ) : (
            <p className="text-xs font-medium text-muted">🔒 Log in to see price</p>
          )}
          {isTrade && p.stock <= 0 && (
            <p className="text-xs font-medium text-danger">Out of stock</p>
          )}
        </div>
        <AddToCart
          product={{ id: p.id, title: p.title, imageUrl: p.imageUrl, price: wholesalePrice(p) }}
          isTrade={isTrade}
          inStock={p.stock > 0}
        />
      </div>
    </div>
  );
}
