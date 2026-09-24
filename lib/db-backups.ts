import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";

/**
 * In-database backup history.
 *
 * A convenience/rollback store that sits next to the off-site Google Drive
 * copies: every nightly and manual backup is also saved here as a full JSON
 * snapshot, pruned to a rolling window. Because it lives in the same database,
 * treat it as quick rollback — not disaster recovery (that's what Drive is for).
 */

/** How many snapshots to keep in the database (last ~2 weeks of dailies). */
export const DB_BACKUP_KEEP = 14;

/** How many dated snapshots to keep off-site in R2 (about a month of dailies). */
export const OFFSITE_BACKUP_KEEP = 30;

export async function saveBackupToDb(
  snapshot: unknown,
  kind: "auto" | "manual",
): Promise<{ id: string }> {
  const json = JSON.stringify(snapshot);
  const row = await db.backup.create({
    data: {
      kind,
      label: new Date().toISOString().slice(0, 10),
      sizeBytes: Buffer.byteLength(json, "utf8"),
      data: snapshot as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  await pruneDbBackups(DB_BACKUP_KEEP);
  return row;
}

/** Keep only the newest `keep` snapshots; delete the rest. */
export async function pruneDbBackups(keep: number): Promise<void> {
  const old = await db.backup.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true },
    skip: Math.max(0, keep),
  });
  if (old.length) {
    await db.backup.deleteMany({ where: { id: { in: old.map((r) => r.id) } } });
  }
}

export type DbBackupMeta = {
  id: string;
  createdAt: string;
  kind: string;
  label: string;
  sizeBytes: number;
};

/** Backup history for the Settings list — metadata only, never the payload. */
export async function listDbBackups(): Promise<DbBackupMeta[]> {
  const rows = await db.backup.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, kind: true, label: true, sizeBytes: true },
    take: 60,
  });
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    kind: r.kind,
    label: r.label,
    sizeBytes: r.sizeBytes,
  }));
}

/** The full snapshot for one stored backup — for download or restore. */
export async function getDbBackup(id: string): Promise<unknown | null> {
  const row = await db.backup.findUnique({ where: { id }, select: { data: true } });
  return row?.data ?? null;
}

/**
 * What the most recent stored backup actually captured — the row counts baked
 * into the snapshot ({@link buildBackupSnapshot} writes `counts`). Lets the
 * Backup screen show "last backup contained N products, M customers…" so the
 * owner can verify a snapshot at a glance instead of trusting it blindly. Only
 * the newest row's payload is read; older ones stay untouched.
 */
export async function getLatestBackupCounts(): Promise<{
  counts: Record<string, number>;
  createdAt: string;
  sizeBytes: number;
} | null> {
  const row = await db.backup.findFirst({
    orderBy: { createdAt: "desc" },
    select: { data: true, createdAt: true, sizeBytes: true },
  });
  if (!row) return null;
  const data = row.data as { counts?: Record<string, unknown> } | null;
  const raw = data && typeof data === "object" ? data.counts : undefined;
  const counts: Record<string, number> = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "number" && Number.isFinite(v)) counts[k] = v;
    }
  }
  return { counts, createdAt: row.createdAt.toISOString(), sizeBytes: row.sizeBytes };
}
