import { NextResponse } from "next/server";
import { errorResponse, requireAnyPermission } from "@/lib/guard";
import { readAudit, audit, getAuditData } from "@/lib/audit";
import {
  listDeletedInvoices,
  restoreDeletedInvoice,
  type DeletedInvoiceSnapshot,
} from "@/lib/billing";
import { invalid } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The audit trail plus the recoverable-deletions bin. Gated on "logs" so it can
 * be granted without handing over Settings; the owner always has it.
 */
export async function GET(req: Request) {
  const denied = await requireAnyPermission(["logs"]);
  if (denied) return denied;

  const months = Math.min(
    12,
    Math.max(1, Number(new URL(req.url).searchParams.get("months")) || 3),
  );
  try {
    const [entries, deleted] = await Promise.all([
      readAudit(months),
      listDeletedInvoices().catch(() => []),
    ]);
    return NextResponse.json({ entries, deleted });
  } catch (err) {
    return errorResponse(err, "load the activity log");
  }
}

/** Restore a hard-deleted invoice from its audit snapshot. */
export async function POST(req: Request) {
  const denied = await requireAnyPermission(["logs"]);
  if (denied) return denied;

  try {
    const body = (await req.json()) as { action?: string; id?: string };
    if (body.action !== "restore" || !body.id) {
      throw invalid("That action is not recognised.");
    }

    const snapshot = (await getAuditData(body.id)) as DeletedInvoiceSnapshot | null;
    if (!snapshot?.number) {
      throw invalid("That deletion has no restorable snapshot.");
    }

    const invoice = await restoreDeletedInvoice(snapshot);
    await audit("invoice.restore", {
      ref: invoice.id,
      name: invoice.number,
      detail: `Restored · total £${invoice.totals.total.toFixed(2)}`,
    });
    return NextResponse.json({ ok: true, invoice });
  } catch (err) {
    return errorResponse(err, "restore this invoice");
  }
}
