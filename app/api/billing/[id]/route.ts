import { NextResponse } from "next/server";
import { errorResponse, requirePermission } from "@/lib/guard";
import { deleteInvoice, getInvoice, updateInvoice } from "@/lib/billing";
import { invoiceSharePath } from "@/lib/invoice-link";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const denied = await requirePermission("invoices");
  if (denied) return denied;

  try {
    const { id } = await params;
    const invoice = await getInvoice(id);
    if (!invoice) {
      return NextResponse.json(
        { error: "That invoice could not be found." },
        { status: 404 },
      );
    }
    // A signed public link staff can hand to the customer (WhatsApp / email).
    return NextResponse.json({ ...invoice, shareUrl: invoiceSharePath(invoice.id) });
  } catch (err) {
    return errorResponse(err, "open this invoice");
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const denied = await requirePermission("invoices");
  if (denied) return denied;

  try {
    const { id } = await params;
    const body = await req.json();
    const invoice = await updateInvoice(id, body);
    await audit("invoice.update", {
      ref: invoice.id,
      name: invoice.number,
      detail: `Edited — total now £${invoice.totals.total.toFixed(2)}`,
    });
    return NextResponse.json(invoice);
  } catch (err) {
    return errorResponse(err, "save this invoice");
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const denied = await requirePermission("invoices");
  if (denied) return denied;

  try {
    const { id } = await params;
    const removed = await deleteInvoice(id);
    // The full snapshot goes into the audit entry so the invoice can be
    // restored from the Activity log — or undone straight away from the list via
    // the returned auditId.
    const auditId = await audit("invoice.delete", {
      ref: id,
      name: removed.number,
      detail: `Deleted — total £${removed.total.toFixed(2)}${
        removed.customerName ? ` — ${removed.customerName}` : ""
      }`,
      data: removed.snapshot,
    });
    return NextResponse.json({ ok: true, auditId, number: removed.number });
  } catch (err) {
    return errorResponse(err, "delete this invoice");
  }
}
