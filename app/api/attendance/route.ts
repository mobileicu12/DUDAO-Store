import { NextResponse } from "next/server";
import { currentCaller } from "@/lib/guard";
import { findUser, verifyPassword } from "@/lib/portal-users";
import { checkMasterPassword } from "@/lib/master-token";
import { tapIn, tapOut, listToday, isTappedIn, TAPIN_COOKIE } from "@/lib/attendance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Seconds until the next auto tap-out (20:30 UTC ≈ 21:30 UK). */
function secondsUntilAutoTapout(): number {
  const now = new Date();
  const t = new Date(now);
  t.setUTCHours(20, 30, 0, 0);
  if (t <= now) t.setUTCDate(t.getUTCDate() + 1);
  return Math.max(60, Math.floor((t.getTime() - now.getTime()) / 1000));
}

export async function GET() {
  const me = await currentCaller();
  if (!me?.email) return NextResponse.json({ today: [], me: null });
  try {
    const today = await listToday();
    const tappedIn = me.viaMaster ? false : await isTappedIn(me.email);
    return NextResponse.json({ today, me: { email: me.email, tappedIn } });
  } catch {
    return NextResponse.json({ error: "Could not load the time-clock." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const me = await currentCaller();
  if (!me?.email) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as
    | { action?: "in" | "out"; password?: string }
    | null;
  if (!body?.action) {
    return NextResponse.json({ error: "Missing action." }, { status: 400 });
  }

  try {
    if (body.action === "out") {
      await tapOut(me.email);
      const res = NextResponse.json({ ok: true, tappedIn: false });
      res.cookies.set(TAPIN_COOKIE, "", { path: "/", maxAge: 0 });
      return res;
    }

    // Tap in — re-verify the caller's password (their own, or the master password).
    const pw = body.password || "";
    const user = me.viaMaster ? null : await findUser(me.email).catch(() => null);
    const ownOk = user ? await verifyPassword(pw, user.passwordHash) : false;
    const ok = ownOk || checkMasterPassword(pw);
    if (!ok) {
      return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
    }

    await tapIn(me.email, me.name ?? undefined);
    const res = NextResponse.json({ ok: true, tappedIn: true });
    res.cookies.set(TAPIN_COOKIE, new Date().toISOString().slice(0, 10), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: secondsUntilAutoTapout(),
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Could not update the time-clock." }, { status: 500 });
  }
}
