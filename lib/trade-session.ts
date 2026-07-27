import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Storefront trade customer session.
 *
 * The public /shop side has no NextAuth session — a trade customer proves who
 * they are with email + a trade access code (see lib/customers generateTradeCode).
 * On success we hand out a signed cookie that names their customer id. The
 * cookie carries an HMAC, never the code itself, so reading it off a device
 * does not reveal the login. Signed with PORTAL_SESSION_SECRET, the same secret
 * that signs public document links.
 *
 * Only node:crypto is imported here so this file stays usable from the proxy.
 */

export const TRADE_COOKIE = "mi_trade";

const secret = (): string => process.env.PORTAL_SESSION_SECRET ?? "";

const sign = (customerId: string): string =>
  createHmac("sha256", secret()).update(`trade:${customerId}`).digest("hex");

/** Build the cookie value for a verified customer. */
export function issueTradeCookie(customerId: string): string {
  return `${customerId}.${sign(customerId)}`;
}

/** Return the customer id a cookie vouches for, or null if it does not verify. */
export function readTradeCookie(value: string | undefined | null): string | null {
  if (!value || secret().length < 8) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = value.slice(0, dot);
  const mac = value.slice(dot + 1);
  const expected = sign(id);
  if (mac.length !== expected.length) return null;
  try {
    return timingSafeEqual(Buffer.from(mac), Buffer.from(expected)) ? id : null;
  } catch {
    return null;
  }
}
