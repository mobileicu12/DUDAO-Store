import { NextResponse } from "next/server";
import { errorResponse, requirePermission } from "@/lib/guard";
import { invalid } from "@/lib/db";
import { getInvoice } from "@/lib/billing";
import { businessForDocs } from "@/lib/doc-business";
import { invoicePdfBuffer } from "@/lib/invoice-pdf";
import { sendEmail, emailConfigured, emailShell } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Email an invoice with the PDF attached. */
export async function POST(req: Request) {
  const denied = await requirePermission("invoices");
  if (denied) return denied;

  try {
    if (!emailConfigured()) {
      throw invalid("Email is not set up yet. Add RESEND_API_KEY to enable it.");
    }

    const { invoiceId, to } = (await req.json()) as {
      invoiceId?: string;
      to?: string;
    };
    if (!invoiceId) throw invalid("Which invoice should be sent?");

    const invoice = await getInvoice(invoiceId);
    if (!invoice) throw invalid("That invoice could not be found.");

    const recipient = to || invoice.customer?.email;
    if (!recipient) {
      throw invalid("No email address for this customer. Add one first.");
    }

    const business = await businessForDocs();
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
          name: invoice.customer?.name || invoice.walkInName || "Customer",
          company: invoice.customer?.company,
          phone: invoice.customer?.phone || invoice.walkInPhone,
          email: invoice.customer?.email,
        },
        lines: invoice.lines,
        totals: invoice.totals,
      },
      business,
    );

    const result = await sendEmail({
      to: recipient,
      subject: `Invoice ${invoice.number} from ${business.name}`,
      html: emailShell(
        business.name,
        `<p>Please find invoice <strong>${invoice.number}</strong> attached.</p>
         <p>Total: <strong>${business.currency} ${invoice.totals.total.toFixed(2)}</strong>${invoice.totals.balance > 0 ? ` — outstanding ${business.currency} ${invoice.totals.balance.toFixed(2)}` : " — paid in full, thank you"}.</p>`,
      ),
      attachments: [
        { filename: `${invoice.number}.pdf`, content: pdf.toString("base64") },
      ],
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    return NextResponse.json({ ok: true, sentTo: recipient });
  } catch (err) {
    return errorResponse(err, "email this invoice");
  }
}
