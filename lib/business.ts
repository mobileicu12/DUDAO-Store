/**
 * Business identity used on invoices, statements and portal chrome.
 *
 * Two layers, on purpose:
 *
 *  - BUSINESS is a synchronous constant built from NEXT_PUBLIC_BIZ_* env vars.
 *    It is always available, including during the very first server render and
 *    inside PDF generators that must not await anything.
 *  - loadBusiness() fetches whatever the owner has since saved in Settings and
 *    overlays it. Settings live in a Shopify metafield, so they can change
 *    without a redeploy.
 *
 * Anything user-facing should prefer loadBusiness() and fall back to BUSINESS.
 */

export type Business = {
  name: string;
  tagline: string;
  addressLines: string[];
  email: string;
  phone: string;
  website: string;
  taxNumber: string;
  bankDetails: string;
  invoiceFooter: string;
  invoicePrefix: string;
  currency: string;
  taxRate: number;
};

const env = (key: string, fallback: string): string => {
  // Next inlines NEXT_PUBLIC_* at build time, so these must be literal lookups
  // rather than process.env[key] — a computed key is not replaced.
  const raw = PUBLIC_ENV[key];
  return raw && raw.trim() ? raw.trim() : fallback;
};

const PUBLIC_ENV: Record<string, string | undefined> = {
  NEXT_PUBLIC_BIZ_NAME: process.env.NEXT_PUBLIC_BIZ_NAME,
  NEXT_PUBLIC_BIZ_TAGLINE: process.env.NEXT_PUBLIC_BIZ_TAGLINE,
  NEXT_PUBLIC_BIZ_ADDRESS: process.env.NEXT_PUBLIC_BIZ_ADDRESS,
  NEXT_PUBLIC_BIZ_EMAIL: process.env.NEXT_PUBLIC_BIZ_EMAIL,
  NEXT_PUBLIC_BIZ_PHONE: process.env.NEXT_PUBLIC_BIZ_PHONE,
  NEXT_PUBLIC_BIZ_WEBSITE: process.env.NEXT_PUBLIC_BIZ_WEBSITE,
  NEXT_PUBLIC_BIZ_VAT: process.env.NEXT_PUBLIC_BIZ_VAT,
  NEXT_PUBLIC_BIZ_BANK: process.env.NEXT_PUBLIC_BIZ_BANK,
  NEXT_PUBLIC_BIZ_FOOTER: process.env.NEXT_PUBLIC_BIZ_FOOTER,
  NEXT_PUBLIC_INVOICE_PREFIX: process.env.NEXT_PUBLIC_INVOICE_PREFIX,
  NEXT_PUBLIC_CURRENCY: process.env.NEXT_PUBLIC_CURRENCY,
  NEXT_PUBLIC_TAX_RATE: process.env.NEXT_PUBLIC_TAX_RATE,
};

/** Address is one env var; newlines or pipes split it into printable lines. */
const splitAddress = (raw: string): string[] =>
  raw
    .split(/\n|\|/)
    .map((line) => line.trim())
    .filter(Boolean);

export const BUSINESS: Business = {
  name: env("NEXT_PUBLIC_BIZ_NAME", "DUDAO"),
  tagline: env("NEXT_PUBLIC_BIZ_TAGLINE", "Trade counter & wholesale"),
  addressLines: splitAddress(env("NEXT_PUBLIC_BIZ_ADDRESS", "United Kingdom")),
  email: env("NEXT_PUBLIC_BIZ_EMAIL", ""),
  phone: env("NEXT_PUBLIC_BIZ_PHONE", ""),
  website: env("NEXT_PUBLIC_BIZ_WEBSITE", ""),
  taxNumber: env("NEXT_PUBLIC_BIZ_VAT", ""),
  bankDetails: env("NEXT_PUBLIC_BIZ_BANK", ""),
  invoiceFooter: env("NEXT_PUBLIC_BIZ_FOOTER", "Thank you for your business."),
  invoicePrefix: env("NEXT_PUBLIC_INVOICE_PREFIX", "DUD"),
  currency: env("NEXT_PUBLIC_CURRENCY", "GBP"),
  taxRate: Number(env("NEXT_PUBLIC_TAX_RATE", "20")) || 0,
};

/** Initials for the logo mark — "DUDAO" -> "DU", "Acme Trade Co" -> "AT". */
export const businessMark = (name: string = BUSINESS.name): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "??";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
};

let cached: Business | null = null;
let inflight: Promise<Business> | null = null;

/**
 * Live business details from Settings, cached in module memory for the life of
 * the process/tab. Never throws — a Shopify outage degrades to env defaults
 * rather than taking down every page that prints a letterhead.
 */
export async function loadBusiness(): Promise<Business> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      if (!res.ok) return BUSINESS;
      const s = (await res.json()) as Partial<Record<keyof Business, unknown>> & {
        address?: string;
      };
      const merged: Business = {
        ...BUSINESS,
        ...(typeof s.name === "string" && s.name ? { name: s.name } : {}),
        ...(typeof s.tagline === "string" ? { tagline: s.tagline } : {}),
        ...(typeof s.address === "string" && s.address
          ? { addressLines: splitAddress(s.address) }
          : {}),
        ...(typeof s.email === "string" ? { email: s.email } : {}),
        ...(typeof s.phone === "string" ? { phone: s.phone } : {}),
        ...(typeof s.website === "string" ? { website: s.website } : {}),
        ...(typeof s.taxNumber === "string" ? { taxNumber: s.taxNumber } : {}),
        ...(typeof s.bankDetails === "string" ? { bankDetails: s.bankDetails } : {}),
        ...(typeof s.invoiceFooter === "string"
          ? { invoiceFooter: s.invoiceFooter }
          : {}),
        ...(typeof s.invoicePrefix === "string" && s.invoicePrefix
          ? { invoicePrefix: s.invoicePrefix }
          : {}),
        ...(typeof s.taxRate === "number" ? { taxRate: s.taxRate } : {}),
      };
      cached = merged;
      return merged;
    } catch {
      return BUSINESS;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Call after saving Settings so the next read picks up the new values. */
export function clearBusinessCache(): void {
  cached = null;
}

export const money = (
  amount: number,
  currency: string = BUSINESS.currency,
): string => {
  const n = Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(n);
  } catch {
    // An invalid currency code in settings must not break an invoice.
    return `${currency} ${n.toFixed(2)}`;
  }
};
