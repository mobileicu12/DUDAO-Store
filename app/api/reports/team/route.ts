import { NextResponse } from "next/server";
import { currentCaller, errorResponse } from "@/lib/guard";
import { listInvoices, summarizeByStaff } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Per-staff sales, for the owner's view on the team screen. Owner only — a
 * member should not see what their colleagues have taken.
 */
export async function GET() {
  const caller = await currentCaller();
  if (!caller) {
    return NextResponse.json({ error: "Not signed in.", byStaff: [] }, { status: 401 });
  }
  if (caller.role !== "owner") {
    return NextResponse.json({ error: "Owner only.", byStaff: [] }, { status: 403 });
  }
  try {
    const { invoices } = await listInvoices({ limit: 200 });
    return NextResponse.json({ byStaff: summarizeByStaff(invoices) });
  } catch (err) {
    return errorResponse(err, "load the team report");
  }
}
