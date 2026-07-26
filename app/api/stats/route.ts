import { NextResponse } from "next/server";
import { errorResponse, requireAuth } from "@/lib/guard";
import { db, dbConfigured } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type CatalogStats = {
  products: number;
  lowStock: number;
  outOfStock: number;
  collections: number;
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
      threshold: 0,
      configured: false,
    } satisfies CatalogStats);
  }

  try {
    const { lowStockThreshold } = await getSettings();

    const [products, lowStock, outOfStock, collections] = await Promise.all([
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
    ]);

    return NextResponse.json({
      products,
      lowStock,
      outOfStock,
      collections,
      threshold: lowStockThreshold,
      configured: true,
    } satisfies CatalogStats);
  } catch (err) {
    return errorResponse(err, "load your catalog figures");
  }
}
