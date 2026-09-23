import { NextResponse } from "next/server";
import { currentTradeCustomer, customerPortalEnabled } from "@/lib/storefront";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Who, if anyone, is signed in on the storefront, and whether the portal is on. */
export async function GET() {
  const [customer, portalEnabled] = await Promise.all([
    currentTradeCustomer(),
    customerPortalEnabled(),
  ]);
  return NextResponse.json({ customer, portalEnabled });
}
