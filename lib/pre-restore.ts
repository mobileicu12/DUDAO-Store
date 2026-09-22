import "server-only";
import { buildBackupSnapshot } from "./backup";
import { uploadTextToR2, r2Configured } from "./s3-backup";
import { uploadTextToDrive, driveConfigured } from "./google-drive";
import { loadBusiness } from "./business";

/**
 * Save a copy of the CURRENT data off-site BEFORE a destructive restore, so a
 * mistaken restore can itself be undone.
 *
 * Best-effort and never throws: a failed safety copy must not block a deliberate
 * restore. Returns the off-site name/key it wrote, or null when no off-site
 * target is configured. Shared by the "restore from file" and "restore a saved
 * backup" routes so both get the same safety net.
 */
export async function savePreRestoreCopy(): Promise<string | null> {
  if (!r2Configured() && !driveConfigured()) return null;

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const current = JSON.stringify(await buildBackupSnapshot());
  let safety: string | null = null;

  if (r2Configured()) {
    try {
      const up = await uploadTextToR2({
        key: `backups/pre-restore-${stamp}.json`,
        content: current,
        contentType: "application/json",
      });
      safety = up.key;
    } catch {
      /* ignore — safety copy must not block the restore */
    }
  }

  if (driveConfigured()) {
    try {
      const biz = await loadBusiness();
      const file = await uploadTextToDrive({
        folderName: `${biz.name} Backups`,
        filename: `pre-restore-${stamp}.json`,
        content: current,
        mimeType: "application/json",
      });
      safety = safety ?? file.name;
    } catch {
      /* ignore */
    }
  }

  return safety;
}
