import { NextResponse } from "next/server";
import { errorResponse, requireAnyPermission, requirePermission } from "@/lib/guard";
import { createCustomer, listCustomers, searchCustomers } from "@/lib/customers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);

  // Typeahead mode is used by the till, so it accepts `billing` too — a
  // counter member must be able to attach a customer to a sale.
  if (url.searchParams.has("search")) {
    const denied = await requireAnyPermission(["customers", "billing", "invoices"]);
    if (denied) return denied;
    try {
      return NextResponse.json({
        customers: await searchCustomers(url.searchParams.get("search") ?? ""),
      });
    } catch (err) {
      return errorResponse(err, "search your customers");
    }
  }

  const denied = await requirePermission("customers");
  if (denied) return denied;

  try {
    return NextResponse.json(
      await listCustomers({
        search: url.searchParams.get("q") ?? undefined,
        segment: url.searchParams.get("segment") ?? undefined,
        cursor: url.searchParams.get("cursor"),
        limit: Number(url.searchParams.get("limit")) || 50,
      }),
    );
  } catch (err) {
    return errorResponse(err, "load your customers");
  }
}

export async function POST(req: Request) {
  const denied = await requireAnyPermission(["customers", "billing"]);
  if (denied) return denied;

  try {
    const body = await req.json();
    return NextResponse.json(await createCustomer(body), { status: 201 });
  } catch (err) {
    return errorResponse(err, "save this customer");
  }
}
