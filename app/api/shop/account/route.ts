import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentTradeCustomer } from "@/lib/storefront";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Update the signed-in trade customer's own contact details. Segments, opening
 * balance, credit limit and trade code are deliberately NOT editable here —
 * those are the shop's to set, not the customer's.
 */
export async function PATCH(req: Request) {
  const customer = await currentTradeCustomer();
  if (!customer) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : undefined);

  const name = str("name");
  const email = str("email");
  if (email !== undefined && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  await db.customer.update({
    where: { id: customer.id },
    data: {
      ...(name !== undefined ? { name: name || customer.name } : {}),
      ...(str("company") !== undefined ? { company: str("company")! } : {}),
      ...(email !== undefined && email ? { email } : {}),
      ...(str("phone") !== undefined ? { phone: str("phone")! } : {}),
    },
  });

  return NextResponse.json({ ok: true });
}
