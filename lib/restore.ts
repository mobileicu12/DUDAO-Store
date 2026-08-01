import "server-only";
import { db, DataError } from "./db";

/**
 * Replace the entire database with the contents of a backup snapshot.
 *
 * This is destructive: it clears the catalogue, customers, invoices and the
 * ledger, then rebuilds them from the file, preserving every id so relations
 * reconnect exactly. It runs in one transaction — if anything fails, nothing
 * changes. Callers must have already taken a safety backup and confirmed.
 */

type AnyRow = Record<string, unknown>;

function asArray(v: unknown): AnyRow[] {
  return Array.isArray(v) ? (v as AnyRow[]) : [];
}

/** A backup must at least look like one before we wipe anything. */
export function isValidSnapshot(s: unknown): s is AnyRow {
  if (!s || typeof s !== "object") return false;
  const o = s as AnyRow;
  return (
    "version" in o &&
    Array.isArray(o.products) &&
    Array.isArray(o.customers) &&
    Array.isArray(o.invoices) &&
    Array.isArray(o.collections)
  );
}

const chunk = <T>(arr: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

export type RestoreResult = {
  products: number;
  collections: number;
  customers: number;
  invoices: number;
  payments: number;
};

export async function restoreFromSnapshot(snapshot: unknown): Promise<RestoreResult> {
  if (!isValidSnapshot(snapshot)) {
    throw new DataError("That file is not a valid DUDAO backup.", {
      status: 400,
      code: "invalid",
    });
  }
  const snap = snapshot as AnyRow;

  const products = asArray(snap.products);
  const collections = asArray(snap.collections);
  const customers = asArray(snap.customers);
  const invoices = asArray(snap.invoices);
  const settings = (snap.settings ?? null) as AnyRow | null;
  const integrations = (snap.integrations ?? null) as AnyRow | null;

  // Join rows and images live inside each product; lines inside each invoice.
  const collectionProducts: AnyRow[] = [];
  const productImages: AnyRow[] = [];
  for (const p of products) {
    for (const cp of asArray(p.collections)) {
      collectionProducts.push({
        collectionId: cp.collectionId,
        productId: cp.productId ?? p.id,
        position: cp.position ?? 0,
      });
    }
    for (const img of asArray(p.images)) {
      productImages.push({
        id: img.id,
        productId: img.productId ?? p.id,
        url: img.url,
        alt: img.alt ?? "",
        position: img.position ?? 0,
      });
    }
  }

  const invoiceLines: AnyRow[] = [];
  const paymentsById = new Map<string, AnyRow>();
  const collectPayment = (pmt: AnyRow) => {
    if (pmt && typeof pmt.id === "string") paymentsById.set(pmt.id, pmt);
  };
  for (const c of customers) for (const pmt of asArray(c.payments)) collectPayment(pmt);
  for (const inv of invoices) {
    for (const l of asArray(inv.lines)) {
      invoiceLines.push({
        id: l.id,
        invoiceId: l.invoiceId ?? inv.id,
        productId: l.productId ?? null,
        title: l.title,
        sku: l.sku ?? "",
        quantity: l.quantity ?? 1,
        unitPrice: l.unitPrice,
        position: l.position ?? 0,
      });
    }
    for (const pmt of asArray(inv.payments)) collectPayment(pmt);
  }

  const pick = (row: AnyRow, keys: string[]): AnyRow => {
    const out: AnyRow = {};
    for (const k of keys) if (row[k] !== undefined) out[k] = row[k];
    return out;
  };

  const productData = products.map((p) =>
    pick(p, [
      "id", "handle", "title", "descriptionHtml", "status", "vendor", "brand",
      "model", "productType", "tags", "sku", "barcode", "price", "compareAtPrice",
      "priceWholesale", "priceShop", "priceEbay", "priceAmazon", "stock", "createdAt",
    ]),
  );
  const collectionData = collections.map((c) =>
    pick(c, ["id", "handle", "title", "descriptionHtml", "imageUrl", "smartRule", "createdAt"]),
  );
  const customerData = customers.map((c) =>
    pick(c, [
      "id", "name", "company", "email", "phone", "address", "city", "postcode",
      "country", "segments", "openingBalance", "creditLimit", "tradeCode", "notes", "createdAt",
    ]),
  );
  const invoiceData = invoices.map((inv) => ({
    ...pick(inv, [
      "id", "number", "customerId", "walkInName", "walkInPhone", "segment",
      "staffEmail", "staffName", "status", "taxable", "taxRate", "discount",
      "notes", "issuedAt", "paidAt", "voidedAt",
    ]),
    // Staff accounts are not part of the backup, so never point at one.
    staffId: null,
  }));
  const paymentData = [...paymentsById.values()].map((pmt) =>
    pick(pmt, [
      "id", "customerId", "invoiceId", "amount", "method", "note",
      "staffEmail", "revoked", "revokedAt", "takenAt",
    ]),
  );

  await db.$transaction(
    async (tx) => {
      // Clear everything, children first.
      await tx.payment.deleteMany({});
      await tx.invoiceLine.deleteMany({});
      await tx.collectionProduct.deleteMany({});
      await tx.productImage.deleteMany({});
      await tx.invoice.deleteMany({});
      await tx.collection.deleteMany({});
      await tx.product.deleteMany({});
      await tx.customer.deleteMany({});

      // Rebuild, parents first so foreign keys resolve.
      for (const part of chunk(customerData, 500))
        await tx.customer.createMany({ data: part as never, skipDuplicates: true });
      for (const part of chunk(productData, 500))
        await tx.product.createMany({ data: part as never, skipDuplicates: true });
      for (const part of chunk(collectionData, 500))
        await tx.collection.createMany({ data: part as never, skipDuplicates: true });
      for (const part of chunk(collectionProducts, 1000))
        await tx.collectionProduct.createMany({ data: part as never, skipDuplicates: true });
      for (const part of chunk(productImages, 1000))
        await tx.productImage.createMany({ data: part as never, skipDuplicates: true });
      for (const part of chunk(invoiceData, 500))
        await tx.invoice.createMany({ data: part as never, skipDuplicates: true });
      for (const part of chunk(invoiceLines, 1000))
        await tx.invoiceLine.createMany({ data: part as never, skipDuplicates: true });
      for (const part of chunk(paymentData, 1000))
        await tx.payment.createMany({ data: part as never, skipDuplicates: true });

      if (settings) {
        const s = pick(settings, [
          "name", "tagline", "address", "email", "phone", "website", "taxNumber",
          "bankDetails", "invoiceFooter", "invoicePrefix", "taxRate", "lowStockThreshold",
          "currency", "faviconUrl", "digestEnabled", "digestToCustomers", "digestToOwner",
          "digestOwnerEmail", "digestOwnerWa", "digestLastRun", "requireTapIn", "reportButtonHour",
        ]);
        await tx.setting.upsert({ where: { id: 1 }, update: s as never, create: { id: 1, ...s } as never });
      }
      if (integrations) {
        const i = pick(integrations, [
          "whatsappToken", "whatsappPhoneId", "whatsappTemplate", "whatsappTemplateLang",
        ]);
        await tx.integration.upsert({ where: { id: 1 }, update: i as never, create: { id: 1, ...i } as never });
      }
    },
    { timeout: 120_000 },
  );

  return {
    products: productData.length,
    collections: collectionData.length,
    customers: customerData.length,
    invoices: invoiceData.length,
    payments: paymentData.length,
  };
}
