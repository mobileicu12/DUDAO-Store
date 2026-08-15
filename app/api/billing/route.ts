import { NextResponse } from "next/server";
import { currentCaller, errorResponse, requirePermission } from "@/lib/guard";
import { getSettings } from "@/lib/settings";
import {
  createBill,
  listInvoices,
  type InvoiceStatus,
  type PaymentMethod,
} from "@/lib/billing";
import type { SegmentKey } from "@/lib/segments";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await requirePermission("invoices");
  if (denied) return denied;

  try {
    const url = new URL(req.url);
    const result = await listInvoices({
      search: url.searchParams.get("q") ?? undefined,
      status: (url.searchParams.get("status") as InvoiceStatus | "all" | "open") ?? "all",
      segment: url.searchParams.get("segment") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      customerId: url.searchParams.get("customer") ?? undefined,
      cursor: url.searchParams.get("cursor"),
      limit: Number(url.searchParams.get("limit")) || 50,
    });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err, "load your invoices");
  }
}

/** Take a sale at the counter. */
export async function POST(req: Request) {
  const denied = await requirePermission("billing");
  if (denied) return denied;

  try {
    const caller = (await currentCaller())!;
    const settings = await getSettings();
    const body = await req.json();

    const invoice = await createBill({
      lines: body.lines ?? [],
      customerId: body.customerId ?? null,
      walkInName: body.walkInName ?? "",
      walkInPhone: body.walkInPhone ?? "",
      segment: (body.segment as SegmentKey) ?? "shop",
      taxable: body.taxable ?? true,
      // The tax rate is taken from settings, never from the request — a
      // tampered payload must not be able to zero the VAT on a sale.
      taxRate: settings.taxRate,
      discount: Number(body.discount) || 0,
      notes: body.notes ?? "",
      staffEmail: caller.email,
      staffName: caller.name,
      // Set once the staff member has confirmed billing past a credit limit.
      overrideCreditLimit: body.override === true,
      payment: body.payment
        ? {
            amount: Number(body.payment.amount) || 0,
            method: (body.payment.method as PaymentMethod) ?? "cash",
            note: body.payment.note ?? "",
          }
        : null,
    });

    await audit("invoice.create", {
      ref: invoice.id,
      name: invoice.number,
      who: caller.email,
      detail: `Total £${invoice.totals.total.toFixed(2)}${
        invoice.totals.paid > 0 ? `, paid £${invoice.totals.paid.toFixed(2)}` : ""
      }${invoice.customer ? ` — ${invoice.customer.name}` : ""}`,
    });

    return NextResponse.json(invoice, { status: 201 });
  } catch (err) {
    return errorResponse(err, "complete this sale");
  }
}
