import { NextResponse } from "next/server";
import {
  MASTER_COOKIE,
  checkMasterPassword,
  masterEnabled,
  signMaster,
} from "@/lib/master-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Master-password sign-in — the way back in when Google is unavailable.
 * Grants owner rights, so it deliberately has no rate-limit-free surface:
 * a wrong password always costs the same time and says the same thing.
 */
export async function POST(req: Request) {
  if (!masterEnabled()) {
    return NextResponse.json(
      {
        error:
          "Master password sign-in is not set up. Ask your developer to set PORTAL_SESSION_SECRET.",
      },
      { status: 400 },
    );
  }

  let password = "";
  try {
    const body = (await req.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    // fall through to the generic failure below
  }

  if (!checkMasterPassword(password)) {
    return NextResponse.json(
      { error: "That password is not correct." },
      { status: 401 },
    );
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(MASTER_COOKIE, signMaster(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12, // a working day, then it expires on its own
  });
  return res;
}

/** Clear the master cookie. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(MASTER_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
