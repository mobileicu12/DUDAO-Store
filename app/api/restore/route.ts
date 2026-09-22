import { NextResponse } from "next/server";
import { errorResponse, requireOwner } from "@/lib/guard";
import { restoreFromSnapshot, isValidSnapshot } from "@/lib/restore";
import { savePreRestoreCopy } from "@/lib/pre-restore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Restore the whole database from a backup file — owner only, destructive.
 *
 * Before touching anything, a snapshot of the CURRENT state is pushed off-site
 * as a "pre-restore" file (best effort) so a mistaken restore can itself be
 * undone. Then the uploaded backup replaces everything in one transaction.
 */
export async function POST(req: Request) {
  const denied = await requireOwner();
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => null);
    // Accept either the raw snapshot or { snapshot: {...} }.
    const snapshot =
      body && typeof body === "object" && "snapshot" in body ? body.snapshot : body;

    if (!isValidSnapshot(snapshot)) {
      return NextResponse.json(
        { error: "That file is not a valid DUDAO backup." },
        { status: 400 },
      );
    }

    // Safety net: save the current state off-site before overwriting it.
    const safety = await savePreRestoreCopy();
    const result = await restoreFromSnapshot(snapshot);
    return NextResponse.json({ ok: true, restored: result, safetyBackup: safety });
  } catch (err) {
    return errorResponse(err, "restore from that backup");
  }
}
