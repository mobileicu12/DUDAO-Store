import { NextResponse } from "next/server";
import { currentCaller } from "@/lib/guard";
import { setOwnPassword } from "@/lib/portal-users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Set your own sign-in password. Works for owners (who otherwise rely on the
 * master password) and staff alike — you can only ever change your own.
 */
export async function POST(req: Request) {
  const caller = await currentCaller();
  if (!caller?.email) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  // The master session is not a real account, so it has no password to change.
  if (caller.viaMaster) {
    return NextResponse.json(
      { error: "You're signed in with the master password — sign in with your own account to set a password." },
      { status: 400 },
    );
  }
  const body = (await req.json().catch(() => ({}))) as { password?: unknown };
  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Choose a password of at least 8 characters." },
      { status: 400 },
    );
  }
  try {
    await setOwnPassword(caller.email, password);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not change your password.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
