import { NextResponse } from "next/server";
import { errorResponse, requireAnyPermission } from "@/lib/guard";
import { lookupByCode } from "@/lib/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Exact barcode or SKU match. Used by the till scanner and inventory. */
export async function GET(req: Request) {
  const denied = await requireAnyPermission(["billing", "inventory"]);
  if (denied) return denied;

  try {
    const code = new URL(req.url).searchParams.get("code") ?? "";
    return NextResponse.json({ product: await lookupByCode(code) });
  } catch (err) {
    return errorResponse(err, "look that barcode up");
  }
}
