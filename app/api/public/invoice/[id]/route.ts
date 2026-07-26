import { NextResponse } from "next/server";
import { getInvoice } from "@/lib/billing";
import { verifyInvoiceToken } from "@/lib/invoice-link";
import { invoicePdfBuffer } from "@/lib/invoice-pdf";
import { businessForDocs } from "@/lib/doc-business";
import { currentCaller } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public invoice PDF.
 *
 * Two ways to be allowed through: a valid HMAC token (the customer's share
 * link), or a signed-in staff member (the download button in the portal).
 *
 * Everything else gets a 404 — never a 403. A 403 would confirm the ID exists,
 * which is precisely what someone walking IDs is trying to learn.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = new URL(req.url).searchParams.get("t");

  const tokenOk = verifyInvoiceToken(id, token);
  const staffOk = tokenOk ? false : Boolean(await currentCaller());

  if (!tokenOk && !staffOk) {
    return new NextResponse("Not found", { status: 404 });
  }

  const invoice = await getInvoice(id);
  if (!invoice) return new NextResponse("Not found", { status: 404 });

  const pdf = invoicePdfBuffer(
    {
      number: invoice.number,
      issuedAt: invoice.issuedAt,
      status: invoice.status,
      taxRate: invoice.taxRate,
      taxable: invoice.taxable,
      notes: invoice.notes,
      staffName: invoice.staffName,
      billTo: {
        name: invoice.customer?.name || invoice.walkInName || "Walk-in customer",
        company: invoice.customer?.company,
        phone: invoice.customer?.phone || invoice.walkInPhone,
        email: invoice.customer?.email,
      },
      lines: invoice.lines,
      totals: invoice.totals,
    },
    await businessForDocs(),
  );

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // inline so it opens in the browser rather than dropping into Downloads —
      // a customer tapping a WhatsApp link expects to just see it.
      "Content-Disposition": `inline; filename="${invoice.number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
