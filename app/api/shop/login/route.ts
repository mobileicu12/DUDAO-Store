import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { TRADE_COOKIE, issueTradeCookie } from "@/lib/trade-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/**
 * Trade login: email + access code. Verification requires BOTH a matching
 * tradeCode AND the seg:online tag — an approved account. A wrong code and an
 * unapproved account fail identically, so the form never reveals which.
 */
export async function POST(req: Request) {
  let email = "";
  let code = "";
  try {
    const body = (await req.json()) as { email?: unknown; code?: unknown };
    email = typeof body.email === "string" ? body.email.trim() : "";
    code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  if (!email || !code) {
    return NextResponse.json(
      { error: "Enter your email and access code." },
      { status: 400 },
    );
  }

  const customer = await db.customer.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      tradeCode: code,
    },
    select: { id: true, segments: true },
  });

  if (!customer || !customer.segments.includes("online")) {
    return NextResponse.json(
      { error: "Those details were not recognised, or the account is not yet approved." },
      { status: 401 },
    );
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(TRADE_COOKIE, issueTradeCookie(customer.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return res;
}

/** Log out — clear the trade cookie. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(TRADE_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
