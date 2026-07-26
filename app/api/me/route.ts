import { NextResponse } from "next/server";
import { currentCaller } from "@/lib/guard";
import { dbConfigured } from "@/lib/db";

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

  return NextResponse.json({
    user: {
      email: caller.email,
      name: caller.name,
      image: caller.image ?? null,
      role: caller.role,
      permissions: caller.permissions,
    },
    canSeeFinance:
      caller.role === "owner" || caller.permissions.includes("reports"),
    viaMaster: caller.viaMaster,
    dbConfigured: dbConfigured(),
  });
}
