import Link from "next/link";
import { money } from "@/lib/business";
import {
  currentTradeCustomer,
  shopProducts,
  shopProductTypes,
  wholesalePrice,
} from "@/lib/storefront";
import { cx } from "@/components/ui/primitives";
import AddToCart from "./AddToCart";

export const dynamic = "force-dynamic";

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const type = sp.type ?? "";

  const [customer, { items, total }, types] = await Promise.all([
    currentTradeCustomer(),
    shopProducts({ q, type, take: 48 }),
    shopProductTypes(),
  ]);
  const isTrade = customer !== null;

  const chip = (label: string, href: string, active: boolean) => (
    <Link
      key={label + href}
      href={href}
      className={cx(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-accent bg-accent-subtle text-accent"
          : "border-line-strong bg-surface text-ink-2 hover:bg-subtle",
      )}
    >
      {label}
    </Link>
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Trade catalogue</h1>
        <p className="mt-1 text-sm text-muted">
          {isTrade
            ? "You're seeing your wholesale prices."
            : "Log in to your trade account to see prices and order."}
        </p>
      </div>

      {!isTrade && (
        <div className="mb-6 flex flex-col gap-2 rounded-lg border border-accent/30 bg-accent-subtle p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-ink">
            🔒 Trade account required to see prices and buy.
          </p>
          <div className="flex gap-2">
            <Link
              href="/shop/trade-login"
              className="flex h-9 items-center rounded-md bg-accent px-3.5 text-sm font-semibold text-accentfg hover:bg-accent-hover"
            >
              Log in
            </Link>
            <Link
              href="/shop/register"
              className="flex h-9 items-center rounded-md border border-line-strong bg-surface px-3.5 text-sm font-medium text-ink hover:bg-subtle"
            >
              Register
            </Link>
          </div>
        </div>
      )}

      {/* Search + type filter */}
      <form method="get" className="mb-4 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search products, SKU or brand…"
          className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)]"
        />
        {type && <input type="hidden" name="type" value={type} />}
        <button
          type="submit"
          className="h-10 shrink-0 rounded-md bg-accent px-4 text-sm font-semibold text-accentfg hover:bg-accent-hover"
        >
          Search
        </button>
      </form>

      {types.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {chip("All", q ? `/shop?q=${encodeURIComponent(q)}` : "/shop", !type)}
          {types.map((t) =>
            chip(
              t,
              `/shop?type=${encodeURIComponent(t)}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
              type === t,
            ),
          )}
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface px-6 py-16 text-center">
          <p className="text-sm font-semibold text-ink">No products found</p>
          <p className="mt-1 text-sm text-muted">
            {q ? "Try a different search." : "The catalogue is being set up."}
          </p>
        </div>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted">
            {total} product{total === 1 ? "" : "s"}
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((p) => (
              <div
                key={p.id}
                className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-sm transition-colors hover:border-line-strong"
              >
                <Link
                  href={`/shop/product/${p.id}`}
                  className="flex aspect-square items-center justify-center overflow-hidden bg-subtle"
                >
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imageUrl}
                      alt={p.title}
                      className="h-full w-full object-cover"
                    />
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
            ))}
          </div>
        </>
      )}
    </div>
  );
}
