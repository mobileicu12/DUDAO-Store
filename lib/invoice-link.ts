import { createHmac, timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";

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

/**
 * The customer-facing landing PAGE for a shared document — a small page with
 * "View PDF" and "Download PDF" buttons, so there's always a clear download
 * option on any device. The raw-PDF *Share paths above back its buttons.
 */
export const invoicePagePath = (id: string): string =>
  `/p/invoice/${id}?t=${signInvoiceToken(id)}`;

export const statementPagePath = (id: string, date: string): string =>
  `/p/statement/${id}?date=${date}&t=${signStatementToken(id, date)}`;

/**
 * Absolute URL for messages — a relative path is useless in WhatsApp.
 *
 * Prefers NEXT_PUBLIC_SITE_URL, but ignores it when it's unset, still the
 * example placeholder ("<your-project>…"), or localhost — in those cases it
 * derives the real host from the incoming request, so share links always point
 * at the actual deployment even if the env var was never set correctly.
 */
export async function absoluteUrl(path: string): Promise<string> {
  let base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  if (!base || base.includes("<") || base.includes("localhost") || base.includes("127.0.0.1")) {
    try {
      const h = await headers();
      const host = h.get("x-forwarded-host") || h.get("host");
      const proto = h.get("x-forwarded-proto") || "https";
      if (host) base = `${proto}://${host}`;
    } catch {
      /* not in a request scope — fall back to whatever base we had */
    }
  }
  return base ? `${base}${path}` : path;
}
