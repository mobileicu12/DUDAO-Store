import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Emergency owner access.
 *
 * If Google is down or the owner is on a borrowed device, they can sign in with
 * the master password (PORTAL_SESSION_SECRET) and get a cookie that grants
 * owner rights. The cookie holds an HMAC, never the secret itself, so reading
 * the cookie off a device does not hand over the password.
 *
 * Only node:crypto is imported here — proxy.ts depends on this file.
 */

export const MASTER_COOKIE = "dudau_master";

const secret = (): string => process.env.PORTAL_SESSION_SECRET ?? "";

export function masterEnabled(): boolean {
  return secret().length >= 8;
}

export function signMaster(): string {
  return createHmac("sha256", secret()).update("master-access").digest("hex");
}

export function verifyMaster(value: string | undefined | null): boolean {
  if (!value || !masterEnabled()) return false;
  const expected = signMaster();
  if (value.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
  } catch {
    return false;
  }
}

/** Check a typed master password against the configured secret. */
export function checkMasterPassword(input: string): boolean {
  if (!masterEnabled() || !input) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(secret());
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
