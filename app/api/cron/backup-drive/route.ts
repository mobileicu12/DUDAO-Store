import { NextResponse } from "next/server";
import { buildBackupSnapshot, backupFilename } from "@/lib/backup";
import { uploadTextToDrive, driveConfigured } from "@/lib/google-drive";
import { saveBackupToDb } from "@/lib/db-backups";
import { loadBusiness } from "@/lib/business";
import { isOwnerRequest } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily off-site backup to Google Drive.
 *
 * Authorised like the digest cron: a CRON_SECRET bearer (how Vercel Cron calls
 * it), the vercel-cron agent when no secret is set, or a signed-in owner using
 * the "Back up now" button. Each firing writes one dated JSON snapshot into a
 * "<Business> Backups" folder in the owner's Drive and prunes to the last 90.
 */
async function authorised(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET ?? "";
  const auth = req.headers.get("authorization") ?? "";
  const ua = req.headers.get("user-agent") ?? "";
  if (secret) {
    if (auth === `Bearer ${secret}`) return true;
  } else if (ua.includes("vercel-cron")) {
    return true;
  }
  return isOwnerRequest();
}

async function handle(req: Request, kind: "auto" | "manual") {
  if (!(await authorised(req))) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }
  try {
    const biz = await loadBusiness();
    const snapshot = await buildBackupSnapshot();

    // Always keep a copy inside the database (quick rollback history), pruned
    // to the last 14. This works even when Drive isn't configured.
    const saved = await saveBackupToDb(snapshot, kind);

    // Off-site copy to Google Drive when it's set up; keep the last 14 dailies
    // so there's always yesterday, a ~weekly, and a ~14-day-old backup. This is
    // best-effort — a Drive problem (e.g. an expired token) must never fail the
    // backup, because the database copy above already succeeded.
    let drive: { file: string; link: string | null } | null = null;
    let driveError: string | null = null;
    if (driveConfigured()) {
      try {
        const file = await uploadTextToDrive({
          folderName: `${biz.name} Backups`,
          filename: backupFilename(biz.name),
          content: JSON.stringify(snapshot),
          mimeType: "application/json",
          keep: 14,
        });
        drive = { file: file.name, link: file.link };
      } catch (e) {
        driveError = e instanceof Error ? e.message : "Drive upload failed.";
      }
    }

    return NextResponse.json({ ok: true, dbBackupId: saved.id, drive, driveError });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Backup failed." },
      { status: 500 },
    );
  }
}

// GET is the scheduled nightly run; POST is the owner's "Back up now" button.
export const GET = (req: Request) => handle(req, "auto");
export const POST = (req: Request) => handle(req, "manual");
