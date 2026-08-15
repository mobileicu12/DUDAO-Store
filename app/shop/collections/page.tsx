import Link from "next/link";
import { shopCollections } from "@/lib/storefront";

export const dynamic = "force-dynamic";

export default async function CollectionsIndex() {
  const collections = await shopCollections();
  const totalProducts = collections.reduce((s, c) => s + c.count, 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Shop by category</h1>
        <p className="mt-1 text-sm text-muted">
          {collections.length} categor{collections.length === 1 ? "y" : "ies"} ·{" "}
          {totalProducts.toLocaleString()} product{totalProducts === 1 ? "" : "s"}
        </p>
      </div>

      {collections.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface px-6 py-16 text-center">
          <p className="text-sm font-semibold text-ink">No categories yet</p>
          <p className="mt-1 text-sm text-muted">
            Collections you create in the portal appear here once they have products.
          </p>
          <Link
            href="/shop"
            className="mt-4 inline-flex h-9 items-center rounded-md bg-accent px-4 text-sm font-semibold text-accentfg hover:bg-accent-hover"
          >
            Browse all products
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {collections.map((c) => (
            <Link
              key={c.id}
              href={`/shop/c/${c.handle}`}
              className="group flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-sm transition-colors hover:border-line-strong"
            >
              <div className="flex aspect-square items-center justify-center overflow-hidden bg-subtle">
                {c.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.imageUrl}
                    alt={c.title}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                ) : (
                  <span className="text-3xl text-faint">🗂️</span>
                )}
              </div>
              <div className="p-3">
                <p className="line-clamp-2 text-sm font-medium text-ink group-hover:text-accent">
                  {c.title}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {c.count} product{c.count === 1 ? "" : "s"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
