import { NextResponse } from "next/server";
import { buildBackupSnapshot, backupFilename } from "@/lib/backup";
import { uploadTextToDrive, driveConfigured } from "@/lib/google-drive";
import { uploadTextToR2, r2Configured } from "@/lib/s3-backup";
import { saveBackupToDb } from "@/lib/db-backups";
import { loadBusiness } from "@/lib/business";
import { isOwnerRequest } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Keep a month of dailies in the off-site bucket. */
const R2_KEEP = 30;

/**
 * Daily end-to-end backup.
 *
 * Three copies, in order of reliability:
 *   1. In the database (always — no credentials, never fails independently).
 *   2. Off-site to Cloudflare R2 (static keys that never expire) when set up.
 *   3. Off-site to Google Drive when its legacy token is still configured.
 *
 * Authorised like the digest cron: a CRON_SECRET bearer (how Vercel Cron calls
 * it), the vercel-cron agent when no secret is set, or a signed-in owner using
 * the "Back up now" button. Copies 2 and 3 are best-effort: an off-site problem
 * must never fail the run, because the database copy has already succeeded.
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
    // to the last 14. This works even when no off-site target is configured.
    const saved = await saveBackupToDb(snapshot, kind);
    const content = JSON.stringify(snapshot);
    const filename = backupFilename(biz.name);

    // Off-site copy to Cloudflare R2 (static keys — never expire). Best-effort.
    let r2: { key: string } | null = null;
    let r2Error: string | null = null;
    if (r2Configured()) {
      try {
        const up = await uploadTextToR2({
          key: `backups/${filename}`,
          content,
          contentType: "application/json",
          keep: R2_KEEP,
        });
        r2 = { key: up.key };
      } catch (e) {
        r2Error = e instanceof Error ? e.message : "R2 upload failed.";
      }
    }

    // Legacy off-site copy to Google Drive, only if its token is still set up.
    let drive: { file: string; link: string | null } | null = null;
    let driveError: string | null = null;
    if (driveConfigured()) {
      try {
        const file = await uploadTextToDrive({
          folderName: `${biz.name} Backups`,
          filename,
          content,
          mimeType: "application/json",
          keep: 14,
        });
        drive = { file: file.name, link: file.link };
      } catch (e) {
        driveError = e instanceof Error ? e.message : "Drive upload failed.";
      }
    }

    return NextResponse.json({
      ok: true,
      dbBackupId: saved.id,
      offsite: r2Configured() || driveConfigured(),
      r2,
      r2Error,
      drive,
      driveError,
    });
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
