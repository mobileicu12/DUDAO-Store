import { NextResponse } from "next/server";
import {
  errorResponse,
  requireAuth,
  requirePermission,
} from "@/lib/guard";
import {
  getIntegrationStatus,
  getSettings,
  saveSettings,
  type PortalSettings,
} from "@/lib/settings";
import { clearBusinessCache } from "@/lib/business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Settings readable by any signed-in staff member — the letterhead, tax rate
 * and low-stock threshold are needed to render invoices and the inventory grid.
 *
 * Note what is NOT here: integration secrets. Those live in a separate
 * metafield and are reported only as booleans via getIntegrationStatus().
 */
export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const settings = await getSettings();
    const integrations = await getIntegrationStatus();
    return NextResponse.json({ ...settings, integrations });
  } catch (err) {
    return errorResponse(err, "load your settings");
  }
}

const WRITABLE: (keyof PortalSettings)[] = [
  "name",
  "tagline",
  "address",
  "email",
  "phone",
  "website",
  "taxNumber",
  "bankDetails",
  "invoiceFooter",
  "invoicePrefix",
  "taxRate",
  "lowStockThreshold",
  "faviconUrl",
  "digestEnabled",
  "digestToCustomers",
  "digestToOwner",
  "digestOwnerEmail",
  "digestOwnerWa",
  "currency",
  "requireTapIn",
  "reportButtonHour",
];

export async function PUT(req: Request) {
  const denied = await requirePermission("settings");
  if (denied) return denied;

  try {
    const body = (await req.json()) as Record<string, unknown>;

    // Allow-list rather than spread: digestLastRun is written by the cron job
    // and must not be settable from the settings form, or the digest could be
    // silently disabled for the day.
    const patch: Partial<PortalSettings> = {};
    for (const key of WRITABLE) {
      if (key in body) {
        (patch as Record<string, unknown>)[key] = body[key];
      }
    }

    const saved = await saveSettings(patch);
    clearBusinessCache();
    const integrations = await getIntegrationStatus();
    return NextResponse.json({ ...saved, integrations });
  } catch (err) {
    return errorResponse(err, "save your settings");
  }
}
