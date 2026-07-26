import { NextResponse } from "next/server";
import { currentCaller, errorResponse, requirePermission } from "@/lib/guard";
import { invalid } from "@/lib/db";
import {
  duplicateInvoice,
  getInvoice,
  recordPayment,
  revokePayment,
  voidInvoice,
  type PaymentMethod,
} from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Everything that changes an invoice's state rather than its contents.
 * One route so the audit-relevant operations sit together and are easy to
 * review as a group.
 */
export async function POST(req: Request, { params }: Ctx) {
  const denied = await requirePermission("invoices");
  if (denied) return denied;

  try {
    const { id } = await params;
    const caller = (await currentCaller())!;
    const body = (await req.json()) as {
      action: string;
      amount?: number;
      method?: PaymentMethod;
      note?: string;
      paymentId?: string;
    };

    switch (body.action) {
      case "payment":
        return NextResponse.json(
          await recordPayment({
            invoiceId: id,
            amount: Number(body.amount) || 0,
            method: body.method ?? "cash",
            note: body.note,
            staffEmail: caller.email,
          }),
        );

      case "pay-balance": {
        const invoice = await getInvoice(id);
        if (!invoice) throw invalid("That invoice could not be found.");
        if (invoice.totals.balance <= 0) {
          throw invalid("This invoice is already settled.");
        }
        return NextResponse.json(
          await recordPayment({
            invoiceId: id,
            amount: invoice.totals.balance,
            method: body.method ?? "cash",
            note: body.note,
            staffEmail: caller.email,
          }),
        );
      }

      case "revoke-payment": {
        if (!body.paymentId) throw invalid("Which payment should be revoked?");
        await revokePayment(body.paymentId);
        return NextResponse.json(await getInvoice(id));
      }

      case "void":
        return NextResponse.json(await voidInvoice(id));

      case "duplicate":
        return NextResponse.json(
          await duplicateInvoice(id, {
            email: caller.email,
            name: caller.name,
          }),
          { status: 201 },
        );

      default:
        throw invalid("That action is not recognised.");
    }
  } catch (err) {
    return errorResponse(err, "update this invoice");
  }
}
