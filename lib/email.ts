import "server-only";
import { Resend } from "resend";

/**
 * Email via Resend.
 *
 * emailConfigured() gates the UI so send buttons are hidden, not broken, when
 * RESEND_API_KEY is not set. Sending never throws to the caller for a config
 * problem — it returns { ok: false } with a readable reason, because a failed
 * email must not roll back the sale it was attached to.
 */

const apiKey = process.env.RESEND_API_KEY ?? "";
const from = process.env.EMAIL_FROM ?? "DUDAO <onboarding@resend.dev>";

export function emailConfigured(): boolean {
  return apiKey.length > 0;
}

let client: Resend | null = null;
function resend(): Resend {
  if (!client) client = new Resend(apiKey);
  return client;
}

export type EmailAttachment = {
  filename: string;
  /** base64-encoded content. */
  content: string;
};

export async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}): Promise<{ ok: boolean; error?: string }> {
  if (!emailConfigured()) {
    return { ok: false, error: "Email is not set up (no RESEND_API_KEY)." };
  }
  if (!args.to.includes("@")) {
    return { ok: false, error: "No valid email address for this recipient." };
  }

  try {
    const { error } = await resend().emails.send({
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      attachments: args.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
      })),
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Email failed to send.",
    };
  }
}

/** Minimal branded wrapper so portal emails look deliberate, not like spam. */
export function emailShell(business: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f6f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#14141a">
    <div style="max-width:560px;margin:0 auto;padding:24px">
      <div style="background:#fff;border:1px solid #e5e5ea;border-radius:14px;overflow:hidden">
        <div style="background:#5b53e0;padding:18px 24px">
          <span style="color:#fff;font-size:18px;font-weight:700">${business}</span>
        </div>
        <div style="padding:24px;font-size:14px;line-height:1.6">${body}</div>
      </div>
      <p style="text-align:center;color:#9a9aa8;font-size:12px;margin-top:16px">Sent by ${business}</p>
    </div>
  </body></html>`;
}
