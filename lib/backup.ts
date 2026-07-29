import "server-only";
import { db } from "./db";
import { getSettings, getIntegrations } from "./settings";

/**
 * The full business snapshot.
 *
 * Every customer with their whole payment ledger, every invoice with its lines
 * and payments, the catalogue, and the settings (including integration secrets
 * — a backup you cannot restore credentials from is not a backup). Products can
 * be re-imported from a spreadsheet; a customer's debt history cannot be
 * reconstructed, so it is the ledgers that make this worth keeping.
 */
export async function buildBackupSnapshot() {
  const [settings, integrations, products, collections, customers, invoices] =
    await Promise.all([
      getSettings(),
      getIntegrations(),
      db.product.findMany({ include: { images: true, collections: true } }),
      db.collection.findMany(),
      db.customer.findMany({ include: { payments: true } }),
      db.invoice.findMany({ include: { lines: true, payments: true } }),
    ]);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    settings,
    integrations,
    products,
    collections,
    customers,
    invoices,
  };
}

/** A dated backup filename, e.g. "dudao-backup-2026-07-29.json". */
export function backupFilename(businessName: string): string {
  const slug =
    businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "portal";
  return `${slug}-backup-${new Date().toISOString().slice(0, 10)}.json`;
}
