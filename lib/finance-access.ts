import "server-only";
import { db } from "./db";

/**
 * Temporary, owner-approved access to sensitive finance figures.
 *
 * This is ADDITIVE to the standing "reports" permission: someone with reports
 * always sees finance. Someone without it never does by default — even on a
 * page they can open — but they can request a look, which the owner approves
 * for a short window (15 minutes), after which it auto-hides.
 */

export const GRANT_MINUTES = 15;

const norm = (e: string) => e.trim().toLowerCase();

export type FinanceStatus = {
  visible: boolean;
  expiresAt: string | null;
  pending: boolean;
};

/** The caller's live grant window (called on the hot path — one indexed read). */
export async function financeStatusFor(
  email: string | null | undefined,
): Promise<FinanceStatus> {
  if (!email) return { visible: false, expiresAt: null, pending: false };
  const row = await db.financeAccess.findUnique({ where: { email: norm(email) } });
  if (!row) return { visible: false, expiresAt: null, pending: false };
  const visible = !!row.expiresAt && row.expiresAt.getTime() > Date.now();
  return {
    visible,
    expiresAt: visible ? row.expiresAt!.toISOString() : null,
    pending: !!row.requestedAt,
  };
}

/** Staff asks to see the figures. Idempotent — one pending request per person. */
export async function requestFinanceAccess(email: string, name: string): Promise<void> {
  const e = norm(email);
  await db.financeAccess.upsert({
    where: { email: e },
    create: { email: e, name: name || e, requestedAt: new Date() },
    update: { name: name || undefined, requestedAt: new Date() },
  });
}

/** Owner grants access for `minutes`; clears the pending request. */
export async function approveFinanceAccess(
  email: string,
  minutes = GRANT_MINUTES,
): Promise<{ email: string; expiresAt: string }> {
  const e = norm(email);
  const expiresAt = new Date(Date.now() + minutes * 60_000);
  await db.financeAccess.upsert({
    where: { email: e },
    create: { email: e, name: e, expiresAt, requestedAt: null },
    update: { expiresAt, requestedAt: null },
  });
  return { email: e, expiresAt: expiresAt.toISOString() };
}

/** Owner revokes access (or dismisses a request) immediately. */
export async function revokeFinanceAccess(email: string): Promise<void> {
  const e = norm(email);
  await db.financeAccess
    .update({ where: { email: e }, data: { expiresAt: null, requestedAt: null } })
    .catch(() => {});
}

export type FinanceRequest = { email: string; name: string; at: string };
export type FinanceGrant = { email: string; expiresAt: string };

/** Owner view: who's waiting, and who currently has (unexpired) access. */
export async function listFinanceAccess(): Promise<{
  requests: FinanceRequest[];
  grants: FinanceGrant[];
}> {
  const rows = await db.financeAccess.findMany();
  const now = Date.now();
  const requests: FinanceRequest[] = [];
  const grants: FinanceGrant[] = [];
  for (const r of rows) {
    if (r.requestedAt) {
      requests.push({ email: r.email, name: r.name, at: r.requestedAt.toISOString() });
    }
    if (r.expiresAt && r.expiresAt.getTime() > now) {
      grants.push({ email: r.email, expiresAt: r.expiresAt.toISOString() });
    }
  }
  requests.sort((a, b) => +new Date(a.at) - +new Date(b.at));
  grants.sort((a, b) => +new Date(a.expiresAt) - +new Date(b.expiresAt));
  return { requests, grants };
}
