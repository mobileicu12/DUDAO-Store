/**
 * Client-safe WhatsApp click-to-chat helpers (no server-only imports, so this
 * can be used in the browser AND on the server).
 *
 * The whole point of the no-API path: sending "just works" everywhere by
 * opening WhatsApp with the message prefilled. When we have a valid number the
 * chat opens straight to that contact; when we don't (walk-ins, customers with
 * no phone on file) WhatsApp opens its contact picker so staff choose who to
 * send to — it is never a dead end.
 */

const COUNTRY_CODE = process.env.NEXT_PUBLIC_WA_COUNTRY_CODE ?? "44";

/**
 * Best-effort E.164 (digits only, no +). Handles +, 00 and a leading national
 * 0, defaulting to the configured country code. Returns null if unusable.
 */
export function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  const s = raw.replace(/[^\d+]/g, "");

  if (s.startsWith("+")) return s.slice(1) || null;
  if (s.startsWith("00")) return s.slice(2) || null;
  if (s.startsWith("0")) return COUNTRY_CODE + s.slice(1);
  // A bare number with no prefix is assumed national.
  if (s.length > 0 && !s.startsWith(COUNTRY_CODE)) return COUNTRY_CODE + s;
  return s || null;
}

/**
 * A wa.me link that ALWAYS opens WhatsApp with the message prefilled. Targeted
 * at the contact when the number is valid; otherwise the contact picker opens.
 */
export function waLink(rawPhone: string | null | undefined, message: string): string {
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  const text = encodeURIComponent(message);
  return phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
}
