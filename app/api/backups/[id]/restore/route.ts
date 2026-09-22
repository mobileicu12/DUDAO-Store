import { NextResponse } from "next/server";
import { requireOwner, errorResponse } from "@/lib/guard";
import { getDbBackup } from "@/lib/db-backups";
import { restoreFromSnapshot, isValidSnapshot } from "@/lib/restore";
import { savePreRestoreCopy } from "@/lib/pre-restore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Restore the whole database from a SAVED backup (owner only, destructive).
 *
 * Same as restoring an uploaded file, but the source is one of the snapshots
 * already stored in the database. A pre-restore safety copy of the current
 * state is pushed off-site first so the restore can itself be undone.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireOwner();
  if (denied) return denied;

  try {
    const { id } = await params;
    const snapshot = await getDbBackup(id);
    if (!snapshot) {
      return NextResponse.json({ error: "That backup could not be found." }, { status: 404 });
    }
    if (!isValidSnapshot(snapshot)) {
      return NextResponse.json({ error: "That saved backup is not valid." }, { status: 400 });
    }

    const safety = await savePreRestoreCopy();
    const result = await restoreFromSnapshot(snapshot);
    return NextResponse.json({ ok: true, restored: result, safetyBackup: safety });
  } catch (err) {
    return errorResponse(err, "restore that backup");
  }
}
