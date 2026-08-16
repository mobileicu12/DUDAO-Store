import { NextResponse } from "next/server";
import { currentCaller } from "@/lib/guard";
import { dbConfigured } from "@/lib/db";
import { financeStatusFor } from "@/lib/finance-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Identity for the current browser session.
 *
 * Public in the proxy's eyes (it must be reachable from /login to decide where
 * to send someone), so it returns 200 with `null` rather than 401 when nobody
 * is signed in — a signed-out user is a normal state here, not an error.
 */
export async function GET() {
  const caller = await currentCaller();

  if (!caller) {
    return NextResponse.json({
      user: null,
      dbConfigured: dbConfigured(),
    });
  }

  const standing =
    caller.role === "owner" || caller.permissions.includes("reports");
  // Members without standing access may hold a temporary owner-approved window.
  let fin = { visible: false, expiresAt: null as string | null, pending: false };
  if (!standing && !caller.viaMaster) {
    fin = await financeStatusFor(caller.email).catch(() => fin);
  }

  return NextResponse.json({
    user: {
      email: caller.email,
      name: caller.name,
      image: caller.image ?? null,
      role: caller.role,
      permissions: caller.permissions,
    },
    canSeeFinance: standing || fin.visible,
    financeExpiresAt: fin.expiresAt,
    financePending: fin.pending,
    viaMaster: caller.viaMaster,
    dbConfigured: dbConfigured(),
  });
}
