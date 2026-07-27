import Link from "next/link";
import { notFound } from "next/navigation";
import { money } from "@/lib/business";
import { currentTradeCustomer, shopProduct, wholesalePrice } from "@/lib/storefront";
import AddToCart from "../../AddToCart";

export const dynamic = "force-dynamic";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [customer, product] = await Promise.all([
    currentTradeCustomer(),
    shopProduct(id),
  ]);
  if (!product) notFound();
  const isTrade = customer !== null;

  return (
    <div>
      <Link href="/shop" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m15 6-6 6 6 6" />
        </svg>
        Back to catalogue
      </Link>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-line bg-subtle">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.imageUrl} alt={product.title} className="h-full w-full object-cover" />
          ) : (
            <span className="text-6xl text-faint">📦</span>
          )}
        </div>

        <div>
          {product.brand && (
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">
              {product.brand}
            </p>
          )}
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">
            {product.title}
          </h1>

          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
            {product.sku && (
              <div className="flex gap-1.5">
                <dt>SKU</dt>
                <dd className="font-medium text-ink-2">{product.sku}</dd>
              </div>
            )}
            {product.model && (
              <div className="flex gap-1.5">
                <dt>Model</dt>
                <dd className="font-medium text-ink-2">{product.model}</dd>
              </div>
            )}
            {product.productType && (
              <div className="flex gap-1.5">
                <dt>Type</dt>
                <dd className="font-medium text-ink-2">{product.productType}</dd>
              </div>
            )}
          </dl>

          <div className="mt-6 rounded-lg border border-line bg-surface p-5">
            {isTrade ? (
              <>
                <p className="text-xs font-medium tracking-wide text-muted uppercase">
                  Your wholesale price
                </p>
                <p className="tnum mt-1 text-3xl font-semibold tracking-tight text-ink">
                  {money(wholesalePrice(product))}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {product.stock > 0 ? `${product.stock} in stock` : "Out of stock"}
                </p>
                <div className="mt-4">
                  <AddToCart
                    product={{
                      id: product.id,
                      title: product.title,
                      imageUrl: product.imageUrl,
                      price: wholesalePrice(product),
                    }}
                    isTrade={isTrade}
                    inStock={product.stock > 0}
                    withQty
                  />
                </div>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-ink">🔒 Trade account required</p>
                <p className="mt-1 text-sm text-muted">
                  Prices and ordering are for approved trade customers only.
                </p>
                <div className="mt-4 flex gap-2">
                  <Link
                    href="/shop/trade-login"
                    className="flex h-10 items-center rounded-md bg-accent px-4 text-sm font-semibold text-accentfg hover:bg-accent-hover"
                  >
                    Log in
                  </Link>
                  <Link
                    href="/shop/register"
                    className="flex h-10 items-center rounded-md border border-line-strong bg-surface px-4 text-sm font-medium text-ink hover:bg-subtle"
                  >
                    Register
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
