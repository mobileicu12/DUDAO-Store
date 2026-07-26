import { NextResponse } from "next/server";
import { errorResponse, requireAnyPermission } from "@/lib/guard";
import { invalid } from "@/lib/db";
import { sendWhatsApp, waConfigured } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Send a plain WhatsApp message — used by the invoice and day-report send. */
export async function POST(req: Request) {
  const denied = await requireAnyPermission(["invoices", "customers"]);
  if (denied) return denied;

  try {
    if (!(await waConfigured())) {
      throw invalid("WhatsApp is not set up. Add credentials in Settings.");
    }

    const { to, message, params } = (await req.json()) as {
      to?: string;
      message?: string;
      params?: string[];
    };
    if (!to) throw invalid("No phone number for this recipient.");
    if (!message) throw invalid("Nothing to send.");

    const result = await sendWhatsApp(to, message, params);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "send this WhatsApp message");
  }
}
