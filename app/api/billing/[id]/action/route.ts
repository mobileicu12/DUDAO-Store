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
import { audit } from "@/lib/audit";

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
      case "payment": {
        const amount = Number(body.amount) || 0;
        const invoice = await recordPayment({
          invoiceId: id,
          amount,
          method: body.method ?? "cash",
          note: body.note,
          staffEmail: caller.email,
        });
        await audit("invoice.payment.add", {
          ref: id,
          name: invoice.number,
          detail: `£${amount.toFixed(2)} ${body.method ?? "cash"}${
            body.note ? ` — ${body.note}` : ""
          }`,
        });
        return NextResponse.json(invoice);
      }

      case "pay-balance": {
        const invoice = await getInvoice(id);
        if (!invoice) throw invalid("That invoice could not be found.");
        if (invoice.totals.balance <= 0) {
          throw invalid("This invoice is already settled.");
        }
        const amount = invoice.totals.balance;
        const updated = await recordPayment({
          invoiceId: id,
          amount,
          method: body.method ?? "cash",
          note: body.note,
          staffEmail: caller.email,
        });
        await audit("invoice.payment.add", {
          ref: id,
          name: updated.number,
          detail: `£${amount.toFixed(2)} ${body.method ?? "cash"} — balance settled`,
        });
        return NextResponse.json(updated);
      }

      case "revoke-payment": {
        if (!body.paymentId) throw invalid("Which payment should be revoked?");
        const before = await getInvoice(id);
        const gone = before?.payments.find((p) => p.id === body.paymentId);
        await revokePayment(body.paymentId);
        await audit("invoice.payment.revoke", {
          ref: id,
          name: before?.number,
          detail: gone
            ? `Removed £${gone.amount.toFixed(2)} ${gone.method}`
            : "Payment revoked",
        });
        return NextResponse.json(await getInvoice(id));
      }

      case "void": {
        const voided = await voidInvoice(id);
        await audit("invoice.void", {
          ref: id,
          name: voided.number,
          detail: "Voided — stock restored and payments revoked",
        });
        return NextResponse.json(voided);
      }

      case "duplicate": {
        const copy = await duplicateInvoice(id, {
          email: caller.email,
          name: caller.name,
        });
        await audit("invoice.duplicate", {
          ref: id,
          name: copy.number,
          detail: `Copied to ${copy.number}`,
        });
        return NextResponse.json(copy, { status: 201 });
      }

      default:
        throw invalid("That action is not recognised.");
    }
  } catch (err) {
    return errorResponse(err, "update this invoice");
  }
}
