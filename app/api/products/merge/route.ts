import { NextResponse } from "next/server";
import { errorResponse, requirePermission } from "@/lib/guard";
import { invalid } from "@/lib/db";
import { mergeProducts } from "@/lib/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requirePermission("inventory");
  if (denied) return denied;

  try {
    const body = (await req.json()) as {
      survivorId?: string;
      mergedIds?: string[];
      addStock?: boolean;
    };
    if (!body.survivorId) throw invalid("Choose which product to keep.");
    if (!Array.isArray(body.mergedIds) || body.mergedIds.length === 0) {
      throw invalid("Choose at least one product to merge in.");
    }
    const result = await mergeProducts(body.survivorId, body.mergedIds, {
      addStock: !!body.addStock,
    });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err, "merge these products");
  }
}
