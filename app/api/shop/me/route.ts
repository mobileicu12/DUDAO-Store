import { NextResponse } from "next/server";
import { currentTradeCustomer } from "@/lib/storefront";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Who, if anyone, is signed in on the storefront. */
export async function GET() {
  const customer = await currentTradeCustomer();
  return NextResponse.json({ customer });
}
