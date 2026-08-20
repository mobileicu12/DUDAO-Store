import { NextResponse } from "next/server";
import { errorResponse, requirePermission } from "@/lib/guard";
import { invalid } from "@/lib/db";
import { undoImport } from "@/lib/excel";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Undo a whole import batch — delete what it created, restore what it changed. */
export async function POST(req: Request) {
  const denied = await requirePermission("inventory");
  if (denied) return denied;

  try {
    const { batchId } = (await req.json().catch(() => ({}))) as { batchId?: string };
    if (!batchId) throw invalid("Which import should be undone?");

    const result = await undoImport(batchId);
    await audit("catalog.import.undo", {
      ref: batchId,
      detail: `Deleted ${result.deleted} created, restored ${result.restored} updated`,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return errorResponse(err, "undo that import");
  }
}
