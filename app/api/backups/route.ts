import { NextResponse } from "next/server";
import { errorResponse, requireOwner } from "@/lib/guard";
import {
  listDbBackups,
  getLatestBackupCounts,
  DB_BACKUP_KEEP,
  OFFSITE_BACKUP_KEEP,
} from "@/lib/db-backups";
import { r2Configured } from "@/lib/s3-backup";
import { driveConfigured } from "@/lib/google-drive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The list of saved backups (owner only) — metadata only, never the payloads.
 *
 * Also reports the retention policy and whether an off-site target is set up,
 * so the Settings screen can show "kept: last N in the database, last M
 * off-site" without guessing.
 */
export async function GET() {
  const denied = await requireOwner();
  if (denied) return denied;

  try {
    const [backups, latest] = await Promise.all([listDbBackups(), getLatestBackupCounts()]);
    return NextResponse.json({
      backups,
      latest,
      keepInDatabase: DB_BACKUP_KEEP,
      keepOffsite: OFFSITE_BACKUP_KEEP,
      offsite: {
        r2: r2Configured(),
        drive: driveConfigured(),
        configured: r2Configured() || driveConfigured(),
      },
    });
  } catch (err) {
    return errorResponse(err, "list your backups");
  }
}
