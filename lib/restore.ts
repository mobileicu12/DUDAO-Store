import "server-only";
import { db, DataError } from "./db";

/**
 * Replace the entire database with the contents of a backup snapshot.
 *
 * Destructive and complete: it clears every table and rebuilds all of them —
 * staff accounts, the invoice counter and the time-clock included — preserving
 * every id so relations reconnect exactly. One transaction: if anything fails,
 * nothing changes. Understands both the flat version-2 snapshot and the older
 * nested version-1 files. Callers must have taken a safety backup and confirmed.
 */

type AnyRow = Record<string, unknown>;

const arr = (v: unknown): AnyRow[] => (Array.isArray(v) ? (v as AnyRow[]) : []);

export function isValidSnapshot(s: unknown): s is AnyRow {
  if (!s || typeof s !== "object") return false;
  const o = s as AnyRow;
  return (
    "version" in o &&
    Array.isArray(o.products) &&
    Array.isArray(o.customers) &&
    Array.isArray(o.invoices)
  );
}

/** Drop server-managed columns so create() sets them fresh. */
function clean(row: AnyRow): AnyRow {
  const { updatedAt: _drop, ...rest } = row;
  void _drop;
  return rest;
}

type Tables = {
  setting: AnyRow | null;
  integration: AnyRow | null;
  counter: AnyRow[];
  users: AnyRow[];
  products: AnyRow[];
  productImages: AnyRow[];
  productVariants: AnyRow[];
  collections: AnyRow[];
  collectionProducts: AnyRow[];
  customers: AnyRow[];
  invoices: AnyRow[];
  invoiceLines: AnyRow[];
  payments: AnyRow[];
  attendance: AnyRow[];
  expenses: AnyRow[];
  buying: AnyRow[];
  cashUps: AnyRow[];
  financeAccess: AnyRow[];
  auditLogs: AnyRow[];
  importBatches: AnyRow[];
};

/** Normalise either snapshot version into flat per-table arrays. */
function normalize(snap: AnyRow): Tables {
  // Version 2/3: flat arrays, one per table. (v3 adds expenses, buying,
  // cash-ups, finance access, audit log and import batches.)
  if (Array.isArray(snap.productImages)) {
    return {
      setting: arr(snap.setting)[0] ?? null,
      integration: arr(snap.integration)[0] ?? null,
      counter: arr(snap.counter),
      users: arr(snap.users),
      products: arr(snap.products),
      productImages: arr(snap.productImages),
      productVariants: arr(snap.productVariants),
      collections: arr(snap.collections),
      collectionProducts: arr(snap.collectionProducts),
      customers: arr(snap.customers),
      invoices: arr(snap.invoices),
      invoiceLines: arr(snap.invoiceLines),
      payments: arr(snap.payments),
      attendance: arr(snap.attendance),
      expenses: arr(snap.expenses),
      buying: arr(snap.buying),
      cashUps: arr(snap.cashUps),
      financeAccess: arr(snap.financeAccess),
      auditLogs: arr(snap.auditLogs),
      importBatches: arr(snap.importBatches),
    };
  }

  // Version 1: images/collections nested in products; lines/payments in invoices.
  const productImages: AnyRow[] = [];
  const collectionProducts: AnyRow[] = [];
  const products = arr(snap.products).map((p) => {
    for (const img of arr(p.images))
      productImages.push({ id: img.id, productId: img.productId ?? p.id, url: img.url, alt: img.alt ?? "", position: img.position ?? 0 });
    for (const cp of arr(p.collections))
      collectionProducts.push({ collectionId: cp.collectionId, productId: cp.productId ?? p.id, position: cp.position ?? 0 });
    const { images: _i, collections: _c, ...rest } = p;
    void _i; void _c;
    return rest;
  });

  const invoiceLines: AnyRow[] = [];
  const paymentsById = new Map<string, AnyRow>();
  const keepPayment = (pmt: AnyRow) => { if (typeof pmt.id === "string") paymentsById.set(pmt.id, pmt); };
  for (const c of arr(snap.customers)) for (const pmt of arr(c.payments)) keepPayment(pmt);
  const invoices = arr(snap.invoices).map((inv) => {
    for (const l of arr(inv.lines))
      invoiceLines.push({ id: l.id, invoiceId: l.invoiceId ?? inv.id, productId: l.productId ?? null, title: l.title, sku: l.sku ?? "", quantity: l.quantity ?? 1, unitPrice: l.unitPrice, position: l.position ?? 0 });
    for (const pmt of arr(inv.payments)) keepPayment(pmt);
    const { lines: _l, payments: _p, ...rest } = inv;
    void _l; void _p;
    return rest;
  });
  const customers = arr(snap.customers).map((c) => {
    const { payments: _p, ...rest } = c;
    void _p;
    return rest;
  });

  return {
    setting: (snap.settings as AnyRow) ?? null,
    integration: (snap.integrations as AnyRow) ?? null,
    counter: [],
    users: [],
    products,
    productImages,
    productVariants: [],
    collections: arr(snap.collections),
    collectionProducts,
    customers,
    invoices,
    invoiceLines,
    payments: [...paymentsById.values()],
    attendance: [],
    expenses: [],
    buying: [],
    cashUps: [],
    financeAccess: [],
    auditLogs: [],
    importBatches: [],
  };
}

const chunk = <T>(a: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
};

export type RestoreResult = {
  users: number;
  products: number;
  variants: number;
  collections: number;
  customers: number;
  invoices: number;
  payments: number;
  attendance: number;
  expenses: number;
  buying: number;
  cashUps: number;
  auditLogs: number;
};

// Only the columns each table actually has — so an old file with extra/renamed
// keys can't break createMany.
const FIELDS: Record<string, string[]> = {
  user: ["id", "email", "name", "phone", "role", "passwordHash", "permissions", "createdAt"],
  customer: ["id", "name", "company", "email", "phone", "address", "city", "postcode", "country", "segments", "openingBalance", "creditLimit", "tradeCode", "notes", "createdAt"],
  product: ["id", "handle", "title", "descriptionHtml", "status", "vendor", "brand", "model", "productType", "tags", "sku", "barcode", "price", "compareAtPrice", "priceWholesale", "priceShop", "priceEbay", "priceAmazon", "stock", "createdAt"],
  collection: ["id", "handle", "title", "descriptionHtml", "imageUrl", "smartRule", "group", "createdAt"],
  collectionProduct: ["collectionId", "productId", "position"],
  productImage: ["id", "productId", "url", "alt", "position"],
  productVariant: ["id", "productId", "title", "sku", "barcode", "price", "compareAtPrice", "priceWholesale", "priceShop", "priceEbay", "priceAmazon", "stock", "position", "createdAt"],
  invoice: ["id", "number", "customerId", "walkInName", "walkInPhone", "segment", "staffEmail", "staffName", "staffId", "status", "taxable", "taxRate", "discount", "notes", "issuedAt", "paidAt", "voidedAt"],
  invoiceLine: ["id", "invoiceId", "productId", "variantId", "title", "variantTitle", "sku", "quantity", "unitPrice", "position"],
  payment: ["id", "customerId", "invoiceId", "amount", "method", "note", "staffEmail", "revoked", "revokedAt", "takenAt"],
  attendance: ["id", "email", "name", "userId", "tapIn", "tapOut", "autoOut"],
  counter: ["id", "year", "seq"],
  setting: ["id", "name", "tagline", "address", "email", "phone", "website", "taxNumber", "bankDetails", "invoiceFooter", "invoicePrefix", "taxRate", "lowStockThreshold", "currency", "faviconUrl", "digestEnabled", "digestToCustomers", "digestToOwner", "digestOwnerEmail", "digestOwnerWa", "digestLastRun", "requireTapIn", "reportButtonHour", "customerPortal"],
  integration: ["whatsappToken", "whatsappPhoneId", "whatsappTemplate", "whatsappTemplateLang"],
  expense: ["id", "date", "category", "description", "amount", "method", "note", "createdBy", "createdAt"],
  buying: ["id", "date", "supplier", "description", "amount", "included", "createdBy", "createdAt"],
  cashUp: ["id", "businessDay", "createdAt", "who", "float", "expectedCash", "cashExpenses", "countedCash", "variance", "countedCard", "cardVariance", "byMethod", "sheet", "note"],
  financeAccess: ["email", "name", "expiresAt", "requestedAt"],
  auditLog: ["id", "at", "who", "action", "ref", "name", "detail", "data"],
  importBatch: ["id", "createdAt", "who", "fileName", "created", "updated", "failed", "snapshot", "undone", "undoneAt"],
};

const shape = (rows: AnyRow[], model: string): AnyRow[] => {
  const keys = FIELDS[model];
  return rows.map((r) => {
    const cleaned = clean(r);
    const out: AnyRow = {};
    for (const k of keys) if (cleaned[k] !== undefined) out[k] = cleaned[k];
    return out;
  });
};

export async function restoreFromSnapshot(snapshot: unknown): Promise<RestoreResult> {
  if (!isValidSnapshot(snapshot)) {
    throw new DataError("That file is not a valid DUDAO backup.", { status: 400, code: "invalid" });
  }
  const t = normalize(snapshot as AnyRow);
  // Only touch the standalone tables that this file actually carries, so
  // restoring an older backup (before these were captured) never silently
  // wipes today's expenses / cash-ups / audit log.
  const snap = snapshot as AnyRow;
  const has = {
    expenses: Array.isArray(snap.expenses),
    buying: Array.isArray(snap.buying),
    cashUps: Array.isArray(snap.cashUps),
    financeAccess: Array.isArray(snap.financeAccess),
    auditLogs: Array.isArray(snap.auditLogs),
    importBatches: Array.isArray(snap.importBatches),
  };

  await db.$transaction(
    async (tx) => {
      // Clear everything, children first.
      await tx.payment.deleteMany({});
      await tx.invoiceLine.deleteMany({});
      await tx.collectionProduct.deleteMany({});
      await tx.productImage.deleteMany({});
      await tx.productVariant.deleteMany({});
      await tx.attendance.deleteMany({});
      await tx.invoice.deleteMany({});
      await tx.collection.deleteMany({});
      await tx.product.deleteMany({});
      await tx.customer.deleteMany({});
      await tx.user.deleteMany({});
      await tx.counter.deleteMany({});
      // Standalone tables (no relations) — cleared only when present in the file.
      if (has.expenses) await tx.expense.deleteMany({});
      if (has.buying) await tx.buying.deleteMany({});
      if (has.cashUps) await tx.cashUp.deleteMany({});
      if (has.financeAccess) await tx.financeAccess.deleteMany({});
      if (has.auditLogs) await tx.auditLog.deleteMany({});
      if (has.importBatches) await tx.importBatch.deleteMany({});

      // Rebuild, parents first.
      for (const p of chunk(shape(t.counter, "counter"), 500)) await tx.counter.createMany({ data: p as never, skipDuplicates: true });
      for (const p of chunk(shape(t.users, "user"), 500)) await tx.user.createMany({ data: p as never, skipDuplicates: true });
      for (const p of chunk(shape(t.customers, "customer"), 500)) await tx.customer.createMany({ data: p as never, skipDuplicates: true });
      for (const p of chunk(shape(t.products, "product"), 500)) await tx.product.createMany({ data: p as never, skipDuplicates: true });
      // Variants sit between products and invoice lines: a line's variantId
      // references one, so they must exist before the lines are rebuilt.
      for (const p of chunk(shape(t.productVariants, "productVariant"), 500)) await tx.productVariant.createMany({ data: p as never, skipDuplicates: true });
      for (const p of chunk(shape(t.collections, "collection"), 500)) await tx.collection.createMany({ data: p as never, skipDuplicates: true });
      for (const p of chunk(shape(t.collectionProducts, "collectionProduct"), 1000)) await tx.collectionProduct.createMany({ data: p as never, skipDuplicates: true });
      for (const p of chunk(shape(t.productImages, "productImage"), 1000)) await tx.productImage.createMany({ data: p as never, skipDuplicates: true });
      for (const p of chunk(shape(t.invoices, "invoice"), 500)) await tx.invoice.createMany({ data: p as never, skipDuplicates: true });
      for (const p of chunk(shape(t.invoiceLines, "invoiceLine"), 1000)) await tx.invoiceLine.createMany({ data: p as never, skipDuplicates: true });
      for (const p of chunk(shape(t.payments, "payment"), 1000)) await tx.payment.createMany({ data: p as never, skipDuplicates: true });
      for (const p of chunk(shape(t.attendance, "attendance"), 1000)) await tx.attendance.createMany({ data: p as never, skipDuplicates: true });
      // Standalone tables (no relations), rebuilt when present in the file.
      if (has.expenses) for (const p of chunk(shape(t.expenses, "expense"), 1000)) await tx.expense.createMany({ data: p as never, skipDuplicates: true });
      if (has.buying) for (const p of chunk(shape(t.buying, "buying"), 1000)) await tx.buying.createMany({ data: p as never, skipDuplicates: true });
      if (has.cashUps) for (const p of chunk(shape(t.cashUps, "cashUp"), 500)) await tx.cashUp.createMany({ data: p as never, skipDuplicates: true });
      if (has.financeAccess) for (const p of chunk(shape(t.financeAccess, "financeAccess"), 1000)) await tx.financeAccess.createMany({ data: p as never, skipDuplicates: true });
      if (has.auditLogs) for (const p of chunk(shape(t.auditLogs, "auditLog"), 1000)) await tx.auditLog.createMany({ data: p as never, skipDuplicates: true });
      if (has.importBatches) for (const p of chunk(shape(t.importBatches, "importBatch"), 500)) await tx.importBatch.createMany({ data: p as never, skipDuplicates: true });

      if (t.setting) {
        const s = shape([t.setting], "setting")[0];
        await tx.setting.upsert({ where: { id: 1 }, update: s as never, create: { id: 1, ...s } as never });
      }
      if (t.integration) {
        const i = shape([t.integration], "integration")[0];
        await tx.integration.upsert({ where: { id: 1 }, update: i as never, create: { id: 1, ...i } as never });
      }
    },
    { timeout: 180_000 },
  );

  return {
    users: t.users.length,
    products: t.products.length,
    variants: t.productVariants.length,
    collections: t.collections.length,
    customers: t.customers.length,
    invoices: t.invoices.length,
    payments: t.payments.length,
    attendance: t.attendance.length,
    expenses: t.expenses.length,
    buying: t.buying.length,
    cashUps: t.cashUps.length,
    auditLogs: t.auditLogs.length,
  };
}
