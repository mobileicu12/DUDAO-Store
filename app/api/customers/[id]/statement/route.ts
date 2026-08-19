import { NextResponse } from "next/server";
import { errorResponse, requireAnyPermission } from "@/lib/guard";
import { invalid } from "@/lib/db";
import { getCustomer } from "@/lib/customers";
import { assembleStatement } from "@/lib/statement-build";
import { statementPdfBuffer } from "@/lib/statement-pdf";
import { businessForDocs } from "@/lib/doc-business";
import { sendEmail, emailConfigured, emailShell } from "@/lib/email";
import { sendWhatsApp, waConfigured } from "@/lib/whatsapp";
import { statementSharePath, absoluteUrl } from "@/lib/invoice-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Send one customer their account statement — full history or a chosen period.
 * Email attaches the PDF; WhatsApp sends a link to the shareable statement.
 */
export async function POST(req: Request, { params }: Ctx) {
  const denied = await requireAnyPermission(["customers", "invoices"]);
  if (denied) return denied;

  try {
    const { id } = await params;
    const { channel, from, to } = (await req.json()) as {
      channel?: "email" | "whatsapp";
      from?: string;
      to?: string;
    };

    const customer = await getCustomer(id);
    if (!customer) throw invalid("That customer could not be found.");

    const business = await businessForDocs();
    const period = from && to ? { from, to } : null;
    const today = new Date().toISOString().slice(0, 10);
    const link = absoluteUrl(
      statementSharePath(id, today) + (period ? `&from=${period.from}&to=${period.to}` : ""),
    );

    if (channel === "whatsapp") {
      if (!(await waConfigured())) throw invalid("WhatsApp is not set up.");
      if (!customer.phone) throw invalid("This customer has no phone number.");
      const res = await sendWhatsApp(
        customer.phone,
        `${business.name}: your account statement. Balance ${business.currency} ${customer.outstanding.toFixed(2)}. View: ${link}`,
        [customer.name, `${business.currency} ${customer.outstanding.toFixed(2)}`, link],
      );
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 502 });
      return NextResponse.json({ ok: true });
    }

    // Email, with the statement PDF attached.
    if (!emailConfigured()) throw invalid("Email is not set up yet.");
    if (!customer.email) throw invalid("This customer has no email address.");

    const pdf = statementPdfBuffer(assembleStatement(customer, period), business);
    const res = await sendEmail({
      to: customer.email,
      subject: `${business.name} — your account statement`,
      html: emailShell(
        business.name,
        `<p>Hi ${customer.name},</p><p>Your account statement is attached. Balance outstanding: <strong>${business.currency} ${customer.outstanding.toFixed(2)}</strong>.</p><p><a href="${link}">View your statement online</a></p>`,
      ),
      attachments: [
        {
          filename: `statement-${customer.name.replace(/[^a-z0-9]+/gi, "-")}.pdf`,
          content: pdf.toString("base64"),
        },
      ],
    });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "send this statement");
  }
}
