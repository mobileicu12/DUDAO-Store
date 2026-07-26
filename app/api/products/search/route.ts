import { NextResponse } from "next/server";
import { errorResponse, requireAnyPermission } from "@/lib/guard";
import { searchProducts } from "@/lib/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Typeahead used by the till and the collection product picker, so it accepts
 * either permission — a counter member with `billing` but not `inventory`
 * still has to be able to find what they are selling.
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
    const products = await searchProducts(
      url.searchParams.get("q") ?? "",
      Number(url.searchParams.get("limit")) || 20,
    );
    return NextResponse.json({ products });
  } catch (err) {
    return errorResponse(err, "search your products");
  }
}
