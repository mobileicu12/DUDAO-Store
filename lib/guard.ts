import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ALL_PERMS, type Me, type PermKey } from "./permissions";
import { MASTER_COOKIE, verifyMaster } from "./master-token";
import { isOwnerEmail } from "./portal-users";
import { DataError } from "./db";

/**
 * Layer two of three-layer permission enforcement, and the one that actually
 * matters.
 *
 * Every API route that reads sensitive data or mutates anything must call one
 * of these as its FIRST statement. The proxy only sees page navigations; a
 * member with a browser console can call any route directly.
 *
 * Each helper returns null when the caller is allowed, or a ready-to-return
 * NextResponse when they are not:
 *
 *   const denied = await requirePermission("billing");
 *   if (denied) return denied;
 */

export type Caller = Me & { viaMaster: boolean };

/** Who is calling, or null if nobody is signed in. */
export async function currentCaller(): Promise<Caller | null> {
  const jar = await cookies();
  if (verifyMaster(jar.get(MASTER_COOKIE)?.value)) {
    return {
      email: "master@local",
      name: "Owner (master password)",
      role: "owner",
      permissions: [...ALL_PERMS],
      viaMaster: true,
    };
  }

  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;

  // Owner status is re-derived from the environment rather than trusted from
  // the token, so revoking an owner takes effect immediately.
  const owner = isOwnerEmail(email);

  return {
    email,
    name: session.user?.name ?? email.split("@")[0],
    image: session.user?.image ?? null,
    role: owner ? "owner" : (session.user?.role ?? "member"),
    permissions: owner ? [...ALL_PERMS] : (session.user?.permissions ?? []),
    viaMaster: false,
  };
}

const unauthorized = () =>
  NextResponse.json(
    { error: "Please sign in to continue." },
    { status: 401 },
  );

const forbidden = (message: string) =>
  NextResponse.json({ error: message }, { status: 403 });

/** Signed in at all — use on read-only routes that expose no finance data. */
export async function requireAuth(): Promise<NextResponse | null> {
  const caller = await currentCaller();
  return caller ? null : unauthorized();
}

export async function requirePermission(
  perm: PermKey,
): Promise<NextResponse | null> {
  const caller = await currentCaller();
  if (!caller) return unauthorized();
  if (caller.role === "owner") return null;
  if (caller.permissions.includes(perm)) return null;
  return forbidden(
    "You do not have access to this. Ask the owner to enable it for your account.",
  );
}

export async function requireAnyPermission(
  perms: PermKey[],
): Promise<NextResponse | null> {
  const caller = await currentCaller();
  if (!caller) return unauthorized();
  if (caller.role === "owner") return null;
  if (perms.some((p) => caller.permissions.includes(p))) return null;
  return forbidden(
    "You do not have access to this. Ask the owner to enable it for your account.",
  );
}

export async function isOwnerRequest(): Promise<boolean> {
  const caller = await currentCaller();
  return caller?.role === "owner";
}

export async function requireOwner(): Promise<NextResponse | null> {
  const caller = await currentCaller();
  if (!caller) return unauthorized();
  if (caller.role === "owner") return null;
  return forbidden("Only the business owner can do this.");
}

/**
 * Whether this caller may see all-time money — turnover, lifetime totals,
 * business reports. Counter staff legitimately need today's takings and a
 * customer's outstanding balance without seeing what the shop is worth.
 */
export async function canSeeFinanceRequest(): Promise<boolean> {
  const caller = await currentCaller();
  if (!caller) return false;
  return caller.role === "owner" || caller.permissions.includes("reports");
}

/**
 * Turn any thrown error into a response phrased for shop staff.
 * Technical detail goes to the server log, never to the browser.
 */
export function errorResponse(err: unknown, fallbackAction: string): NextResponse {
  if (err instanceof DataError) {
    console.error(`[data:${err.code}] ${err.detail}`);
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`[${fallbackAction}] ${detail}`);
  return NextResponse.json(
    { error: `Could not ${fallbackAction}. Please try again.` },
    { status: 500 },
  );
}
