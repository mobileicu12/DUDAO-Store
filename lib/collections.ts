import "server-only";
import { Prisma } from "@prisma/client";
import { db, invalid, notFound, num, uniqueHandle } from "./db";

/** Collections group products for browsing and for filtered marketplace exports. */

export type CollectionSummary = {
  id: string;
  handle: string;
  title: string;
  imageUrl: string;
  smartRule: string;
  productCount: number;
};

export type CollectionDetail = CollectionSummary & {
  descriptionHtml: string;
  products: {
    id: string;
    title: string;
    sku: string;
    price: number;
    stock: number;
    imageUrl: string | null;
  }[];
};

export async function listCollections(): Promise<CollectionSummary[]> {
  const rows = await db.collection.findMany({
    orderBy: { title: "asc" },
    include: { _count: { select: { products: true } } },
  });

  return rows.map((c) => ({
    id: c.id,
    handle: c.handle,
    title: c.title,
    imageUrl: c.imageUrl,
    smartRule: c.smartRule,
    productCount: c._count.products,
  }));
}

export async function getCollection(
  id: string,
): Promise<CollectionDetail | null> {
  const row = await db.collection.findUnique({
    where: { id },
    include: {
      products: {
        orderBy: { position: "asc" },
        include: {
          product: {
            include: { images: { orderBy: { position: "asc" }, take: 1 } },
          },
        },
      },
    },
  });
  if (!row) return null;

  return {
    id: row.id,
    handle: row.handle,
    title: row.title,
    imageUrl: row.imageUrl,
    smartRule: row.smartRule,
    descriptionHtml: row.descriptionHtml,
    productCount: row.products.length,
    products: row.products.map((cp) => ({
      id: cp.product.id,
      title: cp.product.title,
      sku: cp.product.sku,
      price: num(cp.product.price),
      stock: cp.product.stock,
      imageUrl: cp.product.images[0]?.url ?? null,
    })),
  };
}

export async function createCollection(input: {
  title: string;
  descriptionHtml?: string;
  imageUrl?: string;
  smartRule?: string;
}): Promise<CollectionSummary> {
  if (!input.title?.trim()) {
    throw invalid("Give the collection a name before saving.");
  }

  const row = await db.collection.create({
    data: {
      title: input.title.trim(),
      handle: await uniqueHandle("collection", input.title),
      descriptionHtml: input.descriptionHtml ?? "",
      imageUrl: input.imageUrl ?? "",
      smartRule: (input.smartRule ?? "").trim(),
    },
    include: { _count: { select: { products: true } } },
  });

  // File matching products in right away when a rule is set at creation.
  if (row.smartRule) await applySmartRuleToCollection(row.id, row.smartRule);

  return {
    id: row.id,
    handle: row.handle,
    title: row.title,
    imageUrl: row.imageUrl,
    smartRule: row.smartRule,
    productCount: row._count.products,
  };
}

export async function updateCollection(
  id: string,
  input: {
    title?: string;
    descriptionHtml?: string;
    imageUrl?: string;
    smartRule?: string;
  },
): Promise<void> {
  const existing = await db.collection.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw notFound("collection");

  await db.collection.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.descriptionHtml !== undefined
        ? { descriptionHtml: input.descriptionHtml }
        : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      ...(input.smartRule !== undefined ? { smartRule: input.smartRule.trim() } : {}),
    },
  });

  // Applying the (possibly new) rule immediately keeps "set a rule" and "see the
  // products" one action, and matches how staff expect a smart collection to work.
  if (input.smartRule !== undefined && input.smartRule.trim()) {
    await applySmartRuleToCollection(id, input.smartRule.trim());
  }
}

export async function deleteCollection(id: string): Promise<void> {
  // Products are untouched — deleting a grouping must never delete stock.
  await db.collection.delete({ where: { id } });
}

export async function addProducts(
  collectionId: string,
  productIds: string[],
): Promise<number> {
  const result = await db.collectionProduct.createMany({
    data: productIds.map((productId) => ({ collectionId, productId })),
    skipDuplicates: true,
  });
  return result.count;
}

export async function removeProducts(
  collectionId: string,
  productIds: string[],
): Promise<number> {
  const result = await db.collectionProduct.deleteMany({
    where: { collectionId, productId: { in: productIds } },
  });
  return result.count;
}

/**
 * Group every uncategorised product into a collection named after its product
 * type. Creates the collections that do not exist yet and skips products that
 * already sit in one, so it is safe to run repeatedly.
 */
export async function autoOrganise(): Promise<{
  created: number;
  assigned: number;
}> {
  const loose = await db.product.findMany({
    where: {
      productType: { not: "" },
      collections: { none: {} },
    },
    select: { id: true, productType: true },
  });

  if (loose.length === 0) return { created: 0, assigned: 0 };

  const byType = new Map<string, string[]>();
  for (const p of loose) {
    if (!byType.has(p.productType)) byType.set(p.productType, []);
    byType.get(p.productType)!.push(p.id);
  }

  let created = 0;
  let assigned = 0;

  for (const [type, productIds] of byType) {
    let collection = await db.collection.findFirst({
      where: { title: type },
      select: { id: true },
    });

    if (!collection) {
      collection = await db.collection.create({
        data: {
          title: type,
          handle: await uniqueHandle("collection", type),
          smartRule: `productType = ${type}`,
        },
        select: { id: true },
      });
      created++;
    }

    assigned += await addProducts(collection.id, productIds);
  }

  return { created, assigned };
}

/* -------------------------------------------------------------------------- */
/* Smart rules                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The fields a smart rule can match on, for the UI help text and validation.
 */
export const SMART_RULE_FIELDS = [
  { key: "productType", label: "Type" },
  { key: "brand", label: "Brand" },
  { key: "vendor", label: "Vendor" },
  { key: "tag", label: "Tag" },
  { key: "title", label: "Title" },
] as const;

/**
 * Turn a rule string into a product filter. One condition, in the form
 * `field = value` (exact, case-insensitive) or `field contains value`. Tags
 * match an exact tag on the product. Returns null for an empty/unknown rule.
 *
 *   productType = Screens
 *   brand = Apple
 *   tag = lcd
 *   title contains iphone
 */
export function smartRuleWhere(rule: string): Prisma.ProductWhereInput | null {
  const r = (rule ?? "").trim();
  if (!r) return null;

  let field: string;
  let value: string;
  let op: "eq" | "contains";
  const cAt = r.toLowerCase().indexOf(" contains ");
  if (cAt >= 0) {
    field = r.slice(0, cAt).trim().toLowerCase();
    value = r.slice(cAt + " contains ".length).trim();
    op = "contains";
  } else {
    const eq = r.indexOf("=");
    if (eq < 0) return null;
    field = r.slice(0, eq).trim().toLowerCase();
    value = r.slice(eq + 1).trim();
    op = "eq";
  }
  if (!value) return null;

  const text = (): Prisma.StringFilter =>
    op === "contains"
      ? { contains: value, mode: "insensitive" }
      : { equals: value, mode: "insensitive" };

  switch (field) {
    case "type":
    case "producttype":
      return { productType: text() };
    case "brand":
      return { brand: text() };
    case "vendor":
      return { vendor: text() };
    case "model":
      return { model: text() };
    case "title":
    case "name":
      return { title: { contains: value, mode: "insensitive" } };
    case "tag":
    case "tags":
      return { tags: { has: value } };
    default:
      return null;
  }
}

/** True if a rule string is understood (so the UI can warn on a typo). */
export const isValidSmartRule = (rule: string): boolean => smartRuleWhere(rule) !== null;

/** Add every product matching one collection's rule to it (never removes). */
async function applySmartRuleToCollection(
  collectionId: string,
  rule: string,
  scopeIds?: string[],
): Promise<number> {
  const where = smartRuleWhere(rule);
  if (!where) return 0;
  const full: Prisma.ProductWhereInput =
    scopeIds && scopeIds.length ? { AND: [where, { id: { in: scopeIds } }] } : where;
  const matches = await db.product.findMany({ where: full, select: { id: true } });
  if (!matches.length) return 0;
  return addProducts(collectionId, matches.map((m) => m.id));
}

/**
 * Re-evaluate every smart-rule collection and add matching products. Additive
 * only — products added by hand or by an import stay put, so a product freely
 * belongs to as many collections as apply (rule, import and manual all stack).
 * Pass `scopeIds` to limit the pass to just-changed products (e.g. after an
 * import), or omit to sweep the whole catalog.
 */
export async function applySmartRules(scopeIds?: string[]): Promise<number> {
  const collections = await db.collection.findMany({
    where: { NOT: { smartRule: "" } },
    select: { id: true, smartRule: true },
  });
  let added = 0;
  for (const c of collections) {
    added += await applySmartRuleToCollection(c.id, c.smartRule, scopeIds);
  }
  return added;
}
