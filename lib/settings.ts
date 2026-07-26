import "server-only";
import { db, dbConfigured, num } from "./db";

/**
 * Portal settings, split across two tables on purpose:
 *
 *   Setting     — everything staff may read. Served by /api/settings.
 *   Integration — API secrets. NEVER leaves the server.
 *
 * The split is the security boundary. If both lived in one row, any staff
 * account that can open Settings could read the WhatsApp token out of the
 * network tab. Keep them apart.
 */

export type PortalSettings = {
  /* Business identity — printed on every document */
  name: string;
  tagline: string;
  address: string;
  email: string;
  phone: string;
  website: string;
  taxNumber: string;
  bankDetails: string;
  invoiceFooter: string;

  /* Trading rules */
  invoicePrefix: string;
  taxRate: number;
  lowStockThreshold: number;
  currency: string;

  /* Appearance */
  faviconUrl: string;

  /* Daily digest */
  digestEnabled: boolean;
  digestToCustomers: boolean;
  digestToOwner: boolean;
  digestOwnerEmail: string;
  digestOwnerWa: string;
  /** YYYY-MM-DD of the last successful run — makes the cron idempotent. */
  digestLastRun: string;

  /* Staff */
  requireTapIn: boolean;
  /** Hour (0–23) after which the header shows the day-report shortcut. */
  reportButtonHour: number;
};

export const DEFAULT_SETTINGS: PortalSettings = {
  name: "DUDAU",
  tagline: "Trade counter & wholesale",
  address: "",
  email: "",
  phone: "",
  website: "",
  taxNumber: "",
  bankDetails: "",
  invoiceFooter: "Thank you for your business.",

  invoicePrefix: "DUD",
  taxRate: 20,
  lowStockThreshold: 5,
  currency: "GBP",

  faviconUrl: "",

  digestEnabled: false,
  digestToCustomers: false,
  digestToOwner: true,
  digestOwnerEmail: "",
  digestOwnerWa: "",
  digestLastRun: "",

  requireTapIn: false,
  reportButtonHour: 17,
};

/** Secrets. This type must never be returned from an API route. */
export type PortalIntegrations = {
  whatsappToken: string;
  whatsappPhoneId: string;
  whatsappTemplate: string;
  whatsappTemplateLang: string;
};

export const DEFAULT_INTEGRATIONS: PortalIntegrations = {
  whatsappToken: "",
  whatsappPhoneId: "",
  whatsappTemplate: "",
  whatsappTemplateLang: "en",
};

/* -------------------------------------------------------------------------- */

let settingsCache: { at: number; value: PortalSettings } | null = null;
const TTL = 30_000;

const sanitizePrefix = (raw: string): string =>
  String(raw || DEFAULT_SETTINGS.invoicePrefix)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8) || DEFAULT_SETTINGS.invoicePrefix;

/**
 * Read portal settings. Falls back to defaults when the database is
 * unreachable so a connectivity blip degrades the letterhead rather than
 * taking down every page that prints one.
 */
export async function getSettings(force = false): Promise<PortalSettings> {
  if (!dbConfigured()) return DEFAULT_SETTINGS;
  if (!force && settingsCache && Date.now() - settingsCache.at < TTL) {
    return settingsCache.value;
  }

  try {
    const row = await db.setting.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1 },
    });

    const value: PortalSettings = {
      name: row.name,
      tagline: row.tagline,
      address: row.address,
      email: row.email,
      phone: row.phone,
      website: row.website,
      taxNumber: row.taxNumber,
      bankDetails: row.bankDetails,
      invoiceFooter: row.invoiceFooter,
      invoicePrefix: sanitizePrefix(row.invoicePrefix),
      taxRate: num(row.taxRate),
      lowStockThreshold: row.lowStockThreshold,
      currency: row.currency,
      faviconUrl: row.faviconUrl,
      digestEnabled: row.digestEnabled,
      digestToCustomers: row.digestToCustomers,
      digestToOwner: row.digestToOwner,
      digestOwnerEmail: row.digestOwnerEmail,
      digestOwnerWa: row.digestOwnerWa,
      digestLastRun: row.digestLastRun,
      requireTapIn: row.requireTapIn,
      reportButtonHour: row.reportButtonHour,
    };

    settingsCache = { at: Date.now(), value };
    return value;
  } catch {
    return settingsCache?.value ?? DEFAULT_SETTINGS;
  }
}

export async function saveSettings(
  patch: Partial<PortalSettings>,
): Promise<PortalSettings> {
  const data: Record<string, unknown> = {};

  const str = (k: keyof PortalSettings) => {
    if (typeof patch[k] === "string") data[k] = patch[k];
  };
  const bool = (k: keyof PortalSettings) => {
    if (typeof patch[k] === "boolean") data[k] = patch[k];
  };

  (
    [
      "name",
      "tagline",
      "address",
      "email",
      "phone",
      "website",
      "taxNumber",
      "bankDetails",
      "invoiceFooter",
      "currency",
      "faviconUrl",
      "digestOwnerEmail",
      "digestOwnerWa",
      "digestLastRun",
    ] as (keyof PortalSettings)[]
  ).forEach(str);

  (
    [
      "digestEnabled",
      "digestToCustomers",
      "digestToOwner",
      "requireTapIn",
    ] as (keyof PortalSettings)[]
  ).forEach(bool);

  if (patch.invoicePrefix !== undefined) {
    data.invoicePrefix = sanitizePrefix(String(patch.invoicePrefix));
  }
  if (patch.taxRate !== undefined) {
    const n = Number(patch.taxRate);
    data.taxRate = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
  }
  if (patch.lowStockThreshold !== undefined) {
    data.lowStockThreshold = Math.max(
      0,
      Math.round(Number(patch.lowStockThreshold) || 0),
    );
  }
  if (patch.reportButtonHour !== undefined) {
    data.reportButtonHour = Math.min(
      23,
      Math.max(0, Math.round(Number(patch.reportButtonHour) || 0)),
    );
  }

  await db.setting.upsert({
    where: { id: 1 },
    update: data,
    create: { id: 1, ...data },
  });

  settingsCache = null;
  return getSettings(true);
}

/* -------------------------------------------------------------------------- */
/* Integrations (secrets)                                                     */
/* -------------------------------------------------------------------------- */

export async function getIntegrations(): Promise<PortalIntegrations> {
  if (!dbConfigured()) return DEFAULT_INTEGRATIONS;
  try {
    const row = await db.integration.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1 },
    });
    return {
      whatsappToken: row.whatsappToken,
      whatsappPhoneId: row.whatsappPhoneId,
      whatsappTemplate: row.whatsappTemplate,
      whatsappTemplateLang: row.whatsappTemplateLang,
    };
  } catch {
    return DEFAULT_INTEGRATIONS;
  }
}

/**
 * Blank incoming value means "leave the stored secret alone". The settings
 * form renders secret fields empty with a "saved" hint rather than echoing the
 * value back, so a blank submit is the normal case, not an erase. To actually
 * clear a secret the caller sends the literal CLEAR_SECRET.
 */
export const CLEAR_SECRET = "__CLEAR__";

export async function saveIntegrations(
  patch: Partial<PortalIntegrations>,
): Promise<void> {
  const data: Record<string, string> = {};

  for (const key of Object.keys(
    DEFAULT_INTEGRATIONS,
  ) as (keyof PortalIntegrations)[]) {
    const incoming = patch[key];
    if (incoming === undefined) continue;
    const value = String(incoming);
    if (value === CLEAR_SECRET) data[key] = "";
    else if (value.trim() !== "") data[key] = value.trim();
    // Blank → keep what is already stored.
  }

  if (Object.keys(data).length === 0) return;

  await db.integration.upsert({
    where: { id: 1 },
    update: data,
    create: { id: 1, ...data },
  });
}

/**
 * What the browser is allowed to know about integrations: whether they are
 * configured, never what they contain.
 */
export type IntegrationStatus = {
  whatsappConfigured: boolean;
  whatsappTemplate: string;
  emailConfigured: boolean;
};

export async function getIntegrationStatus(): Promise<IntegrationStatus> {
  const i = await getIntegrations();
  return {
    whatsappConfigured: Boolean(i.whatsappToken && i.whatsappPhoneId),
    // The template name is not a secret and the UI needs it to explain
    // whether business-initiated messages will send.
    whatsappTemplate: i.whatsappTemplate,
    emailConfigured: Boolean(process.env.RESEND_API_KEY),
  };
}

/* -------------------------------------------------------------------------- */
/* Invoice numbering                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Next sequential invoice number, e.g. DUD-2026-0001.
 *
 * Runs in a transaction with an atomic increment, so two tills completing a
 * sale in the same instant get different numbers — unlike a read-modify-write
 * against a document store, this is genuinely safe under concurrency.
 */
export async function nextInvoiceNumber(): Promise<string> {
  const { invoicePrefix } = await getSettings();
  const year = new Date().getFullYear();

  const seq = await db.$transaction(async (tx) => {
    const current = await tx.counter.findUnique({ where: { id: 1 } });

    // Numbering restarts each calendar year.
    if (!current || current.year !== year) {
      await tx.counter.upsert({
        where: { id: 1 },
        update: { year, seq: 1 },
        create: { id: 1, year, seq: 1 },
      });
      return 1;
    }

    const updated = await tx.counter.update({
      where: { id: 1 },
      data: { seq: { increment: 1 } },
    });
    return updated.seq;
  });

  return `${invoicePrefix}-${year}-${String(seq).padStart(4, "0")}`;
}

/** Peek without consuming — the settings screen shows the next number. */
export async function peekInvoiceNumber(): Promise<string> {
  const { invoicePrefix } = await getSettings();
  const year = new Date().getFullYear();
  try {
    const current = await db.counter.findUnique({ where: { id: 1 } });
    const seq = current && current.year === year ? current.seq + 1 : 1;
    return `${invoicePrefix}-${year}-${String(seq).padStart(4, "0")}`;
  } catch {
    return `${invoicePrefix}-${year}-0001`;
  }
}

export function clearSettingsCache(): void {
  settingsCache = null;
}
