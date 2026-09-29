import { NextResponse } from "next/server";
import { errorResponse, requireAuth } from "@/lib/guard";
import { db, dbConfigured, num } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type CatalogStats = {
  products: number;
  lowStock: number;
  outOfStock: number;
  collections: number;
  /** Units of stock on hand (sum of positive stock), across non-archived products. */
  stockUnits: number;
  /** Retail value of stock on hand (Σ stock × price), variant-aware. */
  stockValue: number;
  threshold: number;
  configured: boolean;
};

/** Catalog counters for the dashboard. Four indexed counts, one round trip. */
export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  if (!dbConfigured()) {
    return NextResponse.json({
      products: 0,
      lowStock: 0,
      outOfStock: 0,
      collections: 0,
      stockUnits: 0,
      stockValue: 0,
      threshold: 0,
      configured: false,
    } satisfies CatalogStats);
  }

  try {
    const { lowStockThreshold } = await getSettings();

    const [products, lowStock, outOfStock, collections, valueRows, unitRows] = await Promise.all([
      db.product.count({ where: { status: { not: "ARCHIVED" } } }),
      // In stock but at or below the threshold. "Out" is counted separately so
      // the two dashboard cards never double-count the same product.
      db.product.count({
        where: {
          status: { not: "ARCHIVED" },
          stock: { gt: 0, lte: lowStockThreshold },
        },
      }),
      db.product.count({
        where: { status: { not: "ARCHIVED" }, stock: { lte: 0 } },
      }),
      db.collection.count(),
      // Stock value = flat products (no variants) at their own price + every
      // variant at its own price. A variant product's own price is only the
      // "from" price, so its variants must be valued individually.
      db.$queryRaw<{ flat: string | null; variant: string | null }[]>`
        SELECT
          (SELECT COALESCE(SUM(p.stock * p.price), 0)
             FROM "Product" p
            WHERE p.status <> 'ARCHIVED' AND p.stock > 0
              AND NOT EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p.id)) AS flat,
          (SELECT COALESCE(SUM(v.stock * v.price), 0)
             FROM "ProductVariant" v
             JOIN "Product" p2 ON p2.id = v."productId"
            WHERE p2.status <> 'ARCHIVED' AND v.stock > 0) AS variant
      `,
      db.$queryRaw<{ units: bigint | null }[]>`
        SELECT COALESCE(SUM(stock), 0) AS units
          FROM "Product" WHERE status <> 'ARCHIVED' AND stock > 0
      `,
    ]);

    const stockValue = num(valueRows[0]?.flat ?? 0) + num(valueRows[0]?.variant ?? 0);
    const stockUnits = Number(unitRows[0]?.units ?? 0);

    return NextResponse.json({
      products,
      lowStock,
      outOfStock,
      collections,
      stockUnits,
      stockValue: Math.round(stockValue * 100) / 100,
      threshold: lowStockThreshold,
      configured: true,
    } satisfies CatalogStats);
  } catch (err) {
    return errorResponse(err, "load your catalog figures");
  }
}
