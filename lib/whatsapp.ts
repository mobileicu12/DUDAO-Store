import "server-only";
import { getIntegrations } from "./settings";

/**
 * WhatsApp via the Meta Cloud API.
 *
 * Credentials come from getIntegrations() — the secured table, never from
 * /api/settings — so a staff account reading settings can never see the token.
 *
 * Business-initiated messages outside the customer's 24-hour service window
 * require an approved template. When a template name is configured we send via
 * template; otherwise we fall back to a plain text message, which only lands if
 * the customer messaged first. Either way the failure is returned, never thrown.
 */

const COUNTRY_CODE = process.env.NEXT_PUBLIC_WA_COUNTRY_CODE ?? "44";

export async function waConfigured(): Promise<boolean> {
  const i = await getIntegrations();
  return Boolean(i.whatsappToken && i.whatsappPhoneId);
}

/**
 * Best-effort E.164. Handles +, 00 and a leading national 0, defaulting to the
 * configured country code. A number that is already international is left as is.
 */
export function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  let s = raw.replace(/[^\d+]/g, "");

  if (s.startsWith("+")) return s.slice(1) || null;
  if (s.startsWith("00")) return s.slice(2) || null;
  if (s.startsWith("0")) return COUNTRY_CODE + s.slice(1);
  // A bare number with no prefix is assumed national.
  if (s.length > 0 && !s.startsWith(COUNTRY_CODE)) return COUNTRY_CODE + s;
  return s || null;
}

export async function sendWhatsApp(
  to: string,
  message: string,
  templateParams?: string[],
): Promise<{ ok: boolean; error?: string }> {
  const i = await getIntegrations();
  if (!i.whatsappToken || !i.whatsappPhoneId) {
    return { ok: false, error: "WhatsApp is not set up." };
  }

  const phone = normalizePhone(to);
  if (!phone) {
    return { ok: false, error: "No valid phone number for this recipient." };
  }

  const url = `https://graph.facebook.com/v21.0/${i.whatsappPhoneId}/messages`;

  const body = i.whatsappTemplate
    ? {
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: i.whatsappTemplate,
          language: { code: i.whatsappTemplateLang || "en" },
          ...(templateParams && templateParams.length
            ? {
                components: [
                  {
                    type: "body",
                    parameters: templateParams.map((text) => ({
                      type: "text",
                      text,
                    })),
                  },
                ],
              }
            : {}),
        },
      }
    : {
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body: message },
      };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${i.whatsappToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      let reason = `WhatsApp API returned ${res.status}`;
      try {
        const parsed = JSON.parse(text) as { error?: { message?: string } };
        if (parsed.error?.message) reason = parsed.error.message;
      } catch {
        // keep the status-code reason
      }
      return { ok: false, error: reason };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "WhatsApp failed to send.",
    };
  }
}
