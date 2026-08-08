import "server-only";
import { db } from "./db";

/**
 * A COMPLETE snapshot of the database — every table, every column.
 *
 * Each table is dumped as a flat array of raw rows, so nothing is summarised or
 * dropped and the whole thing can be restored back exactly (see lib/restore.ts).
 * This includes staff accounts, the invoice counter and the time-clock, not
 * just the catalogue and ledger.
 *
 * Version 2 is the flat, all-tables shape. Older files (version 1) nested images
 * and lines inside their parents and omitted staff/counter/attendance; the
 * restore still understands them.
 */
export async function buildBackupSnapshot() {
  const [
    setting,
    integration,
    counter,
    users,
    products,
    productImages,
    collections,
    collectionProducts,
    customers,
    invoices,
    invoiceLines,
    payments,
    attendance,
  ] = await Promise.all([
    db.setting.findMany(),
    db.integration.findMany(),
    db.counter.findMany(),
    db.user.findMany(),
    db.product.findMany(),
    db.productImage.findMany(),
    db.collection.findMany(),
    db.collectionProduct.findMany(),
    db.customer.findMany(),
    db.invoice.findMany(),
    db.invoiceLine.findMany(),
    db.payment.findMany(),
    db.attendance.findMany(),
  ]);

  return {
    version: 2,
    generatedAt: new Date().toISOString(),
    counts: {
      users: users.length,
      products: products.length,
      collections: collections.length,
      customers: customers.length,
      invoices: invoices.length,
      payments: payments.length,
      attendance: attendance.length,
    },
    // Every table, flat. Keys map 1:1 to Prisma models.
    setting,
    integration,
    counter,
    users,
    products,
    productImages,
    collections,
    collectionProducts,
    customers,
    invoices,
    invoiceLines,
    payments,
    attendance,
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
