import { NextResponse } from "next/server";
import { errorResponse, requirePermission } from "@/lib/guard";
import { getIntegrationStatus, saveIntegrations } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Save WhatsApp credentials. Write-only by design.
 *
 * A blank token means "keep the stored one" (see saveIntegrations), so the
 * settings form can render the field empty with a "saved" hint and never has to
 * echo the secret back. This route returns only the boolean status, never the
 * credential itself — that is the whole reason the secret lives in a separate
 * table.
 */
export async function PUT(req: Request) {
  const denied = await requirePermission("settings");
  if (denied) return denied;

  try {
    const body = (await req.json()) as {
      whatsappToken?: string;
      whatsappPhoneId?: string;
      whatsappTemplate?: string;
      whatsappTemplateLang?: string;
    };

    await saveIntegrations({
      whatsappToken: body.whatsappToken,
      whatsappPhoneId: body.whatsappPhoneId,
      whatsappTemplate: body.whatsappTemplate,
      whatsappTemplateLang: body.whatsappTemplateLang,
    });

    return NextResponse.json(await getIntegrationStatus());
  } catch (err) {
    return errorResponse(err, "save your WhatsApp settings");
  }
}
