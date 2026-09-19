import "server-only";
import { getIntegrations } from "./settings";
import { normalizePhone, waLink } from "./wa-link";

export { normalizePhone, waLink };

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

export async function waConfigured(): Promise<boolean> {
  const i = await getIntegrations();
  return Boolean(i.whatsappToken && i.whatsappPhoneId);
}

/**
 * A wa.me click-to-chat URL — the no-API fallback.
 *
 * When the Cloud API isn't set up, this is how a message still "sends": it opens
 * WhatsApp with the text prefilled, ready to send by hand — to the given
 * contact, or (if there's no usable number) to whoever staff pick.
 */
export function waRedirectUrl(rawPhone: string | null | undefined, message: string): string {
  return waLink(rawPhone, message);
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
