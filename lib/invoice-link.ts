import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed capability links for documents.
 *
 * Invoice IDs are opaque cuids, but the rule holds regardless: any resource
 * shared by URL and identified without a session needs a signature, or it is
 * enumerable. This is what lets you WhatsApp a customer their invoice without
 * them logging in anywhere.
 *
 * A wrong or missing token gets a 404, never a 403 — a 403 would confirm the
 * ID exists, which is exactly what an enumerator is fishing for.
 */

const secret = (): string => process.env.PORTAL_SESSION_SECRET ?? "";

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

function verify(payload: string, token: string | null | undefined): boolean {
  if (!token || !secret()) return false;
  const expected = sign(payload);
  if (token.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

export const signInvoiceToken = (id: string): string => sign(`inv:${id}`);

export const verifyInvoiceToken = (
  id: string,
  token: string | null | undefined,
): boolean => verify(`inv:${id}`, token);

/** Statements are keyed on customer AND date, so a link cannot walk forward. */
export const signStatementToken = (id: string, date: string): string =>
  sign(`stmt:${id}:${date}`);

export const verifyStatementToken = (
  id: string,
  date: string,
  token: string | null | undefined,
): boolean => verify(`stmt:${id}:${date}`, token);

export const invoiceSharePath = (id: string): string =>
  `/api/public/invoice/${id}?t=${signInvoiceToken(id)}`;

export const statementSharePath = (id: string, date: string): string =>
  `/api/public/statement/${id}?date=${date}&t=${signStatementToken(id, date)}`;

/** Absolute URL for messages — a relative path is useless in WhatsApp. */
export function absoluteUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  return base ? `${base}${path}` : path;
}
