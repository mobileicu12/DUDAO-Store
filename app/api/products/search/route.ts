import { NextResponse } from "next/server";
import { errorResponse, requireAnyPermission } from "@/lib/guard";
import { searchProducts, searchSellable } from "@/lib/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Typeahead used by the till and the collection product picker, so it accepts
 * either permission — a counter member with `billing` but not `inventory`
 * still has to be able to find what they are selling.
 *
 * `mode=sellable` expands variant products into one hit per variant (what the
 * till sells); the default returns whole product records (the picker).
 */
export async function GET(req: Request) {
  const denied = await requireAnyPermission([
    "inventory",
    "billing",
    "collections",
  ]);
  if (denied) return denied;

  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q") ?? "";
    const limit = Number(url.searchParams.get("limit")) || 20;
    if (url.searchParams.get("mode") === "sellable") {
      const hits = await searchSellable(q, limit);
      return NextResponse.json({ hits });
    }
    const products = await searchProducts(q, limit);
    return NextResponse.json({ products });
  } catch (err) {
    return errorResponse(err, "search your products");
  }
}
