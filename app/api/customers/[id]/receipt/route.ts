import { NextResponse } from "next/server";
import { getCustomer } from "@/lib/customers";
import { businessForDocs } from "@/lib/doc-business";
import { receiptPdfBuffer, type ReceiptDoc } from "@/lib/receipt-pdf";
import { requirePermission } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Payment receipt PDF for one ledger payment.
 *
 * Staff-only (customers permission). The receipt states the amount received and
 * the customer's current account balance — printed straight after taking a
 * payment, that balance is exactly "after this payment"; reprinted later it is
 * simply the truthful current balance.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requirePermission("customers");
  if (denied) return denied;

  const { id } = await params;
  const paymentId = new URL(req.url).searchParams.get("paymentId");
  if (!paymentId) {
    return new NextResponse("Missing paymentId", { status: 400 });
  }

  const customer = await getCustomer(id);
  if (!customer) return new NextResponse("Not found", { status: 404 });

  const payment = customer.ledger.find((p) => p.id === paymentId && !p.revoked);
  if (!payment) return new NextResponse("Not found", { status: 404 });

  const receipt: ReceiptDoc = {
    customer: {
      name: customer.name,
      company: customer.company,
      address: [customer.address, customer.city, customer.postcode]
        .filter(Boolean)
        .join(", "),
      phone: customer.phone,
      email: customer.email,
    },
    amount: payment.amount,
    method: payment.method,
    date: payment.takenAt,
    note: payment.note,
    reference: payment.invoiceNumber,
    balanceNow: customer.outstanding,
    generatedAt: new Date().toISOString(),
  };

  const pdf = receiptPdfBuffer(receipt, await businessForDocs());

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="receipt-${customer.name.replace(
        /[^a-z0-9]+/gi,
        "-",
      )}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
