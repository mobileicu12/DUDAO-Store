import { NextResponse } from "next/server";
import { errorResponse, requireAnyPermission } from "@/lib/guard";
import { lookupByCode, lookupSellableByCode } from "@/lib/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Exact barcode or SKU match. Used by the till scanner and inventory.
 *
 * `mode=sellable` resolves a variant's own barcode/SKU to that variant (what the
 * till adds to the cart); the default returns the whole product record.
 */
export async function GET(req: Request) {
  const denied = await requireAnyPermission(["billing", "inventory"]);
  if (denied) return denied;

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code") ?? "";
    if (url.searchParams.get("mode") === "sellable") {
      return NextResponse.json({ hit: await lookupSellableByCode(code) });
    }
    return NextResponse.json({ product: await lookupByCode(code) });
  } catch (err) {
    return errorResponse(err, "look that barcode up");
  }
}
