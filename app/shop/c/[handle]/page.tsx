import Link from "next/link";
import { notFound } from "next/navigation";
import { currentTradeCustomer, shopCollection } from "@/lib/storefront";
import ProductCard from "../../ProductCard";

export const dynamic = "force-dynamic";

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const [customer, collection] = await Promise.all([
    currentTradeCustomer(),
    shopCollection(handle),
  ]);
  if (!collection) notFound();
  const isTrade = customer !== null;

  return (
    <div>
      <nav className="mb-3 text-sm text-muted">
        <Link href="/shop" className="hover:text-accent">
          Shop
        </Link>{" "}
        <span className="mx-1">/</span>{" "}
        <Link href="/shop/collections" className="hover:text-accent">
          Categories
        </Link>{" "}
        <span className="mx-1">/</span>{" "}
        <span className="text-ink-2">{collection.title}</span>
      </nav>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          {collection.title}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {collection.items.length} product{collection.items.length === 1 ? "" : "s"}
        </p>
        {collection.descriptionHtml && (
          <div
            className="prose prose-sm mt-2 max-w-2xl text-muted [&_a]:text-accent"
            dangerouslySetInnerHTML={{ __html: collection.descriptionHtml }}
          />
        )}
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

      {collection.items.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface px-6 py-16 text-center">
          <p className="text-sm font-semibold text-ink">Nothing here yet</p>
          <p className="mt-1 text-sm text-muted">
            This category has no active products right now.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {collection.items.map((p) => (
            <ProductCard key={p.id} product={p} isTrade={isTrade} />
          ))}
        </div>
      )}
    </div>
  );
}
