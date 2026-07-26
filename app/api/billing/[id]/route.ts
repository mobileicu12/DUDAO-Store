import { NextResponse } from "next/server";
import { errorResponse, requirePermission } from "@/lib/guard";
import { deleteInvoice, getInvoice, updateInvoice } from "@/lib/billing";

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
    return NextResponse.json(invoice);
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
    return NextResponse.json(await updateInvoice(id, body));
  } catch (err) {
    return errorResponse(err, "save this invoice");
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const denied = await requirePermission("invoices");
  if (denied) return denied;

  try {
    const { id } = await params;
    await deleteInvoice(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "delete this invoice");
  }
}
