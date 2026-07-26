import "server-only";
import { getSettings } from "./settings";
import type { BusinessDoc } from "./invoice-pdf";

/**
 * Settings shaped for the PDF generators. Every document route needs this, so
 * it lives here rather than being copied into each one — a letterhead that
 * differs between the invoice and the statement looks like a forgery.
 */
export async function businessForDocs(): Promise<BusinessDoc> {
  const s = await getSettings();
  return {
    name: s.name,
    tagline: s.tagline,
    addressLines: s.address
      .split(/\n|\|/)
      .map((line) => line.trim())
      .filter(Boolean),
    email: s.email,
    phone: s.phone,
    website: s.website,
    taxNumber: s.taxNumber,
    bankDetails: s.bankDetails,
    invoiceFooter: s.invoiceFooter,
    currency: s.currency,
  };
}
