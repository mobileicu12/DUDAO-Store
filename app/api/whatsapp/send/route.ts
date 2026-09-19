import { NextResponse } from "next/server";
import { errorResponse, requireAnyPermission } from "@/lib/guard";
import { invalid } from "@/lib/db";
import { sendWhatsApp, waConfigured, waRedirectUrl } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Send a plain WhatsApp message — used by the invoice and day-report send. */
export async function POST(req: Request) {
  const denied = await requireAnyPermission(["invoices", "customers"]);
  if (denied) return denied;

  try {
    const { to, message, params } = (await req.json()) as {
      to?: string;
      message?: string;
      params?: string[];
    };
    if (!to) throw invalid("No phone number for this recipient.");
    if (!message) throw invalid("Nothing to send.");

    // No Cloud API → hand back a wa.me link the client opens directly.
    if (!(await waConfigured())) {
      const redirect = waRedirectUrl(to, message);
      if (!redirect) throw invalid("No valid phone number for this recipient.");
      return NextResponse.json({ ok: true, redirect });
    }

    const result = await sendWhatsApp(to, message, params);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "send this WhatsApp message");
  }
}
