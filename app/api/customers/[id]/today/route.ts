import { NextResponse } from "next/server";
import { errorResponse, requireAnyPermission } from "@/lib/guard";
import { invalid } from "@/lib/db";
import { getCustomer } from "@/lib/customers";
import { customerDayPdf } from "@/lib/digest";
import { businessForDocs } from "@/lib/doc-business";
import { sendEmail, emailConfigured, emailShell } from "@/lib/email";
import { sendWhatsApp, waConfigured } from "@/lib/whatsapp";
import { statementSharePath, absoluteUrl } from "@/lib/invoice-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Send one customer their day summary — the manual counterpart to the digest,
 * used by the "today's send" drawer. Channel is chosen by the caller.
 */
export async function POST(req: Request, { params }: Ctx) {
  const denied = await requireAnyPermission(["customers", "invoices"]);
  if (denied) return denied;

  try {
    const { id } = await params;
    const { channel } = (await req.json()) as { channel?: "email" | "whatsapp" };

    const customer = await getCustomer(id);
    if (!customer) throw invalid("That customer could not be found.");

    const business = await businessForDocs();
    const today = new Date().toISOString().slice(0, 10);
    const link = absoluteUrl(statementSharePath(id, today));

    if (channel === "whatsapp") {
      if (!(await waConfigured())) throw invalid("WhatsApp is not set up.");
      if (!customer.phone) throw invalid("This customer has no phone number.");
      const res = await sendWhatsApp(
        customer.phone,
        `${business.name}: your day summary. Balance ${business.currency} ${customer.outstanding.toFixed(2)}. Statement: ${link}`,
        [customer.name, `${business.currency} ${customer.outstanding.toFixed(2)}`, link],
      );
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 502 });
      return NextResponse.json({ ok: true });
    }

    // Email, with the itemised day PDF attached.
    if (!emailConfigured()) throw invalid("Email is not set up yet.");
    if (!customer.email) throw invalid("This customer has no email address.");

    const pdf = await customerDayPdf(id, today);
    const res = await sendEmail({
      to: customer.email,
      subject: `${business.name} — your summary for today`,
      html: emailShell(
        business.name,
        `<p>Hi ${customer.name},</p><p>Your day summary is attached. Account balance: <strong>${business.currency} ${customer.outstanding.toFixed(2)}</strong>.</p><p><a href="${link}">View your full statement</a></p>`,
      ),
      attachments: pdf
        ? [{ filename: pdf.filename, content: pdf.buffer.toString("base64") }]
        : undefined,
    });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "send this day summary");
  }
}
