import { NextResponse } from "next/server";
import { errorResponse, requirePermission } from "@/lib/guard";
import { invalid } from "@/lib/db";
import { getMergeCandidates, mergeDuplicatesAuto, mergeProducts } from "@/lib/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Authoritative details for the merge modal (stock, status, invoice-line counts).
export async function GET(req: Request) {
  const denied = await requirePermission("inventory");
  if (denied) return denied;

  try {
    const ids = (new URL(req.url).searchParams.get("ids") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return NextResponse.json({ candidates: await getMergeCandidates(ids) });
  } catch (err) {
    return errorResponse(err, "load these products");
  }
}

export async function POST(req: Request) {
  const denied = await requirePermission("inventory");
  if (denied) return denied;

  try {
    const body = (await req.json()) as {
      survivorId?: string;
      mergedIds?: string[];
      addStock?: boolean;
      detailsFrom?: string;
      strategy?: "newest" | "oldest";
    };

    // Batch mode: resolve every duplicate group at once, keeping newest/oldest.
    if (body.strategy === "newest" || body.strategy === "oldest") {
      const result = await mergeDuplicatesAuto(body.strategy, {
        addStock: !!body.addStock,
      });
      return NextResponse.json(result);
    }

    if (!body.survivorId) throw invalid("Choose which product to keep.");
    if (!Array.isArray(body.mergedIds) || body.mergedIds.length === 0) {
      throw invalid("Choose at least one product to merge in.");
    }
    const result = await mergeProducts(body.survivorId, body.mergedIds, {
      addStock: !!body.addStock,
      detailsFrom: body.detailsFrom,
    });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err, "merge these products");
  }
}
