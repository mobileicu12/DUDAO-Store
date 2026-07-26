import { NextResponse } from "next/server";
import { errorResponse, requireAnyPermission } from "@/lib/guard";
import { customersBilledToday } from "@/lib/customers";
import { dayRange } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Everyone billed today with their bills, for the "today's send" drawer and the
 * today's-customers panel. Strictly grouped by account — one customer's bills
 * never mixed into another's.
 */
export async function GET() {
  const denied = await requireAnyPermission(["customers", "invoices", "billing"]);
  if (denied) return denied;

  try {
    const groups = await customersBilledToday(dayRange());
    return NextResponse.json({
      customers: groups.map((g) => ({
        id: g.customer?.id ?? null,
        name: g.customer?.name ?? "Walk-in",
        email: g.customer?.email ?? "",
        phone: g.customer?.phone ?? "",
        hasAccount: Boolean(g.customer),
        dayTotal: g.dayTotal,
        dayPaid: g.dayPaid,
        invoiceCount: g.invoices.length,
        invoices: g.invoices.map((i) => ({
          id: i.id,
          number: i.number,
          total: i.total,
          paid: i.paid,
        })),
      })),
    });
  } catch (err) {
    return errorResponse(err, "load today's customers");
  }
}
