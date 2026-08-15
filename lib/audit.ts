import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { currentCaller } from "./guard";
import type { AuditEntry } from "./audit-labels";

/**
 * Append-only audit trail for anything that moves money.
 *
 * Every invoice edit, void, deletion, restore and every payment recorded or
 * revoked is written to the AuditLog table with who did it and when. When a
 * balance looks wrong, this is what lets you reconstruct how it got that way.
 *
 * Unlike MOBILE ICU (which buckets the trail in Shopify metafields), DUDAO owns
 * its database, so the trail is just rows — indexed, searchable and unbounded.
 */

export {
  AUDIT_LABELS,
  AUDIT_CRITICAL,
  type AuditEntry,
} from "./audit-labels";

// Who is making this request? Never throws — an audit write must never break
// the action it is recording. Falls back to the master-password admin, then to
// "unknown".
export async function currentActor(): Promise<string> {
  try {
    const caller = await currentCaller();
    if (!caller) return "unknown";
    if (caller.viaMaster) return "master-password";
    return caller.email || "unknown";
  } catch {
    return "unknown";
  }
}

// Record an event. Never throws: losing a log line is bad, but failing the sale
// or the payment because the log write failed would be worse.
export async function audit(
  action: string,
  info: {
    ref?: string;
    name?: string;
    detail?: string;
    who?: string;
    data?: unknown;
  } = {},
): Promise<void> {
  try {
    const who = info.who || (await currentActor());
    await db.auditLog.create({
      data: {
        who,
        action,
        ref: info.ref ?? "",
        name: info.name ?? "",
        detail: (info.detail ?? "").slice(0, 300),
        data:
          info.data === undefined
            ? undefined
            : (info.data as Prisma.InputJsonValue),
      },
    });
  } catch {
    /* deliberately swallowed — see above */
  }
}

// Read the trail, newest first, across the last `months` (1–12).
export async function readAudit(months = 3): Promise<AuditEntry[]> {
  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - Math.min(12, Math.max(1, months)));

  const rows = await db.auditLog.findMany({
    where: { at: { gte: since } },
    orderBy: { at: "desc" },
    take: 2000,
  });

  return rows.map((r) => ({
    id: r.id,
    at: r.at.toISOString(),
    who: r.who,
    action: r.action,
    ref: r.ref || undefined,
    name: r.name || undefined,
    detail: r.detail || undefined,
    restorable: r.action === "invoice.delete" && r.data != null,
  }));
}

// The stored payload for one audit row — the deleted-invoice snapshot used to
// restore it from the log.
export async function getAuditData(id: string): Promise<unknown | null> {
  const row = await db.auditLog.findUnique({ where: { id }, select: { data: true } });
  return row?.data ?? null;
}
