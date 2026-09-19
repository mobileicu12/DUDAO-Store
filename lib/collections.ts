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
  group: string;
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
    group: c.group,
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
    group: row.group,
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
  group?: string;
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
      group: (input.group ?? "").trim(),
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
    group: row.group,
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
    group?: string;
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
      ...(input.group !== undefined ? { group: input.group.trim() } : {}),
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

/** Put a set of collections under one group heading (blank clears the group). */
export async function setCollectionGroup(
  ids: string[],
  group: string,
): Promise<number> {
  if (ids.length === 0) return 0;
  const r = await db.collection.updateMany({
    where: { id: { in: ids } },
    data: { group: group.trim() },
  });
  return r.count;
}

/**
 * Auto-group collections whose names share a base — "Camera Lens",
 * "Camera Lens (2pcs)", "Camera Lens (Complete Set)" all become group
 * "Camera Lens". Strips a trailing "(…)" to find the base, then groups any base
 * shared by two or more collections. Only touches collections that don't already
 * have a group, so it never overwrites groups set by hand.
 */
export async function autoGroupCollections(): Promise<{
  grouped: number;
  groups: number;
}> {
  const rows = await db.collection.findMany({
    where: { group: "" },
    select: { id: true, title: true },
  });

  const base = (t: string) =>
    t.replace(/\s*\([^)]*\)\s*$/, "").replace(/\s+/g, " ").trim();

  const byBase = new Map<string, string[]>();
  for (const c of rows) {
    const b = base(c.title);
    if (!b) continue;
    if (!byBase.has(b)) byBase.set(b, []);
    byBase.get(b)!.push(c.id);
  }

  let grouped = 0;
  let groups = 0;
  for (const [b, ids] of byBase) {
    if (ids.length < 2) continue; // a lone collection isn't a group
    await db.collection.updateMany({
      where: { id: { in: ids } },
      data: { group: b },
    });
    grouped += ids.length;
    groups++;
  }

  return { grouped, groups };
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
type ParsedRule = { field: string; op: "eq" | "contains"; value: string };

function parseRule(rule: string): ParsedRule | null {
  const r = (rule ?? "").trim();
  if (!r) return null;
  const cAt = r.toLowerCase().indexOf(" contains ");
  if (cAt >= 0) {
    const value = r.slice(cAt + " contains ".length).trim();
    if (!value) return null;
    return { field: r.slice(0, cAt).trim().toLowerCase(), op: "contains", value };
  }
  const eq = r.indexOf("=");
  if (eq < 0) return null;
  const value = r.slice(eq + 1).trim();
  if (!value) return null;
  return { field: r.slice(0, eq).trim().toLowerCase(), op: "eq", value };
}

export function smartRuleWhere(rule: string): Prisma.ProductWhereInput | null {
  const p = parseRule(rule);
  if (!p) return null;
  const text = (): Prisma.StringFilter =>
    p.op === "contains"
      ? { contains: p.value, mode: "insensitive" }
      : { equals: p.value, mode: "insensitive" };

  switch (p.field) {
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
      return { title: { contains: p.value, mode: "insensitive" } };
    case "tag":
    case "tags":
      return { tags: { has: p.value } };
    default:
      return null;
  }
}

/** In-memory version of the rule, for products not yet in the DB (import preview). */
export function matchesSmartRule(
  product: {
    productType?: string;
    brand?: string;
    vendor?: string;
    model?: string;
    title?: string;
    tags?: string[];
  },
  rule: string,
): boolean {
  const p = parseRule(rule);
  if (!p) return false;
  const v = p.value.toLowerCase();
  const eq = (a?: string) => (a ?? "").toLowerCase() === v;
  const has = (a?: string) => (a ?? "").toLowerCase().includes(v);
  const str = (a?: string) => (p.op === "contains" ? has(a) : eq(a));
  switch (p.field) {
    case "type":
    case "producttype":
      return str(product.productType);
    case "brand":
      return str(product.brand);
    case "vendor":
      return str(product.vendor);
    case "model":
      return str(product.model);
    case "title":
    case "name":
      return has(product.title);
    case "tag":
    case "tags":
      return (product.tags ?? []).some((t) => t.toLowerCase() === v);
    default:
      return false;
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
