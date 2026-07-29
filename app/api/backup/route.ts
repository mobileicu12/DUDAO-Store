import { NextResponse } from "next/server";
import { errorResponse, requireOwner } from "@/lib/guard";
import { buildBackupSnapshot } from "@/lib/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Full JSON snapshot — owner only.
 *
 * This exists because the payment ledgers and opening balances are the
 * business's own records, not something a host's database export presents in a
 * readable form. Products can be re-imported from a spreadsheet; a customer's
 * debt history cannot be reconstructed. So the backup carries every customer
 * WITH their full ledger, plus settings and the integration secrets (this file
 * is the one place they legitimately leave the server, and only to the owner).
 */
export async function GET() {
  const denied = await requireOwner();
  if (denied) return denied;

  try {
    const snapshot = await buildBackupSnapshot();

    return new NextResponse(JSON.stringify(snapshot, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="dudao-backup-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err, "build your backup");
  }
}
