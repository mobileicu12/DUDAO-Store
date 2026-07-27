import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Storefront self-registration. Creates a customer with NO segment, so they
 * cannot see trade prices or sign in until an owner opens the account and
 * approves it (sets seg:online). The `website` field is a honeypot — a real
 * person never fills it, a bot fills everything, so a non-empty value is
 * accepted and thrown away.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");

  // Honeypot: pretend success, create nothing.
  if (str("website")) return NextResponse.json({ ok: true });

  const firstName = str("firstName");
  const lastName = str("lastName");
  const email = str("email");
  const company = str("company");
  const phone = str("phone");
  const note = str("note");

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  }
  const name = [firstName, lastName].filter(Boolean).join(" ") || company || email;

  // Don't create a duplicate account if this email already applied or exists.
  const existing = await db.customer.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (!existing) {
    await db.customer.create({
      data: {
        name,
        company,
        email,
        phone,
        segments: [],
        notes: [
          "pending-approval · storefront-signup",
          note ? `Applicant note: ${note}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    });
  }

  // Always the same answer, whether new, duplicate or honeypot — never reveal
  // whether an address is already on file.
  return NextResponse.json({ ok: true });
}
