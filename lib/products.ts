import "server-only";
import type { Prisma } from "@prisma/client";
import {
  db,
  invalid,
  money2,
  notFound,
  num,
  numOrNull,
  uniqueHandle,
} from "./db";
import { channelsFromTags, withChannels, type ChannelKey } from "./channels";
import { applySmartRules } from "./collections";
import { tierNum, type TierPrices } from "./pricing";
import { audit } from "./audit";

/**
 * Product reads and writes. Everything the inventory grid, the product editor,
 * the till and the Excel importer need.
 */

export type ProductStatus = "ACTIVE" | "DRAFT" | "ARCHIVED";

export type ProductRecord = {
  id: string;
  handle: string;
  title: string;
  status: ProductStatus;
  vendor: string;
  brand: string;
  model: string;
  productType: string;
  tags: string[];
  sku: string;
  barcode: string;
  price: number;
  compareAtPrice: number | null;
  tiers: TierPrices;
  stock: number;
  imageUrl: string | null;
  channels: ChannelKey[];
  updatedAt: string;
};

type ProductRow = Prisma.ProductGetPayload<{
  include: { images: { orderBy: { position: "asc" }; take: 1 } };
}>;

export const toRecord = (p: ProductRow): ProductRecord => ({
  id: p.id,
  handle: p.handle,
  title: p.title,
  status: p.status as ProductStatus,
  vendor: p.vendor,
  brand: p.brand,
  model: p.model,
  productType: p.productType,
  tags: p.tags,
  sku: p.sku,
  barcode: p.barcode,
  price: num(p.price),
  compareAtPrice: numOrNull(p.compareAtPrice),
  tiers: {
    wholesale: numOrNull(p.priceWholesale),
    shop: numOrNull(p.priceShop),
    ebay: numOrNull(p.priceEbay),
    amazon: numOrNull(p.priceAmazon),
  },
  stock: p.stock,
  imageUrl: p.images[0]?.url ?? null,
  channels: channelsFromTags(p.tags),
  updatedAt: p.updatedAt.toISOString(),
});

const withFirstImage = {
  images: { orderBy: { position: "asc" as const }, take: 1 },
};

/* -------------------------------------------------------------------------- */
/* Listing                                                                    */
/* -------------------------------------------------------------------------- */

export type StockFilter = "all" | "low" | "out";

export type ListProductsArgs = {
  search?: string;
  status?: ProductStatus | "all";
  stock?: StockFilter;
  productType?: string;
  collectionId?: string;
  lowStockThreshold?: number;
  /** Opaque cursor — the id of the last row from the previous page. */
  cursor?: string | null;
  limit?: number;
  sort?: "title" | "price" | "stock" | "updated";
  dir?: "asc" | "desc";
};

export type ListProductsResult = {
  products: ProductRecord[];
  nextCursor: string | null;
  total: number;
};

export function buildProductWhere(
  args: ListProductsArgs,
): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {};

  if (args.status && args.status !== "all") {
    where.status = args.status;
  } else {
    // Archived products are hidden unless explicitly asked for — staff should
    // not have to scroll past discontinued lines all day.
    where.status = { not: "ARCHIVED" };
  }

  const q = args.search?.trim();
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { sku: { contains: q, mode: "insensitive" } },
      { barcode: { contains: q, mode: "insensitive" } },
      { brand: { contains: q, mode: "insensitive" } },
      { model: { contains: q, mode: "insensitive" } },
    ];
  }

  if (args.stock === "low") {
    where.stock = { gt: 0, lte: args.lowStockThreshold ?? 5 };
  } else if (args.stock === "out") {
    where.stock = { lte: 0 };
  }

  if (args.productType) where.productType = args.productType;

  if (args.collectionId) {
    where.collections = { some: { collectionId: args.collectionId } };
  }

  return where;
}

export async function listProducts(
  args: ListProductsArgs,
): Promise<ListProductsResult> {
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
  const where = buildProductWhere(args);

  const dir = args.dir ?? "asc";
  const orderBy: Prisma.ProductOrderByWithRelationInput[] =
    args.sort === "price"
      ? [{ price: dir }, { id: "asc" }]
      : args.sort === "stock"
        ? [{ stock: dir }, { id: "asc" }]
        : args.sort === "updated"
          ? [{ updatedAt: dir }, { id: "asc" }]
          : [{ title: dir }, { id: "asc" }];

  const [rows, total] = await Promise.all([
    db.product.findMany({
      where,
      orderBy,
      include: withFirstImage,
      // Cursor pagination rather than offset: the inventory list is a "load
      // more" feed and offset paging would skip or repeat rows whenever a
      // colleague edits stock mid-scroll.
      take: limit + 1,
      ...(args.cursor ? { cursor: { id: args.cursor }, skip: 1 } : {}),
    }),
    db.product.count({ where }),
  ]);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    products: page.map(toRecord),
    nextCursor: hasMore ? page[page.length - 1].id : null,
    total,
  };
}

/** Fast typeahead for the till and the collection picker. */
export async function searchProducts(
  q: string,
  limit = 20,
): Promise<ProductRecord[]> {
  const term = q.trim();
  if (!term) return [];

  const rows = await db.product.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { sku: { equals: term, mode: "insensitive" } },
        { barcode: { equals: term, mode: "insensitive" } },
        { title: { contains: term, mode: "insensitive" } },
        { sku: { contains: term, mode: "insensitive" } },
        { brand: { contains: term, mode: "insensitive" } },
        { model: { contains: term, mode: "insensitive" } },
      ],
    },
    include: withFirstImage,
    orderBy: { title: "asc" },
    take: Math.min(limit, 50),
  });

  return rows.map(toRecord);
}

/** Exact match on barcode or SKU, for the scanner. */
export async function lookupByCode(code: string): Promise<ProductRecord | null> {
  const term = code.trim();
  if (!term) return null;

  const row = await db.product.findFirst({
    where: {
      OR: [
        { barcode: { equals: term, mode: "insensitive" } },
        { sku: { equals: term, mode: "insensitive" } },
      ],
    },
    include: withFirstImage,
  });

  return row ? toRecord(row) : null;
}

export async function getProduct(id: string): Promise<ProductRecord | null> {
  const row = await db.product.findUnique({
    where: { id },
    include: withFirstImage,
  });
  return row ? toRecord(row) : null;
}

/** Distinct product types, for filter dropdowns and auto-organise. */
export async function productTypes(): Promise<string[]> {
  const rows = await db.product.findMany({
    where: { productType: { not: "" } },
    distinct: ["productType"],
    select: { productType: true },
    orderBy: { productType: "asc" },
  });
  return rows.map((r) => r.productType);
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

export type ProductInput = {
  title: string;
  descriptionHtml?: string;
  status?: ProductStatus;
  vendor?: string;
  brand?: string;
  model?: string;
  productType?: string;
  tags?: string[];
  sku?: string;
  barcode?: string;
  price: number;
  compareAtPrice?: number | null;
  tiers?: TierPrices;
  stock?: number;
  channels?: ChannelKey[];
  images?: { url: string; alt?: string }[];
  collectionIds?: string[];
};

const tierData = (tiers: TierPrices | undefined) =>
  tiers === undefined
    ? {}
    : {
        priceWholesale: tierNum(tiers.wholesale),
        priceShop: tierNum(tiers.shop),
        priceEbay: tierNum(tiers.ebay),
        priceAmazon: tierNum(tiers.amazon),
      };

function assertValid(input: Partial<ProductInput>): void {
  if (input.title !== undefined && !input.title.trim()) {
    throw invalid("Give the product a name before saving.");
  }
  if (input.price !== undefined && (!Number.isFinite(input.price) || input.price < 0)) {
    throw invalid("The price must be a number, and cannot be negative.");
  }
}

export async function createProduct(input: ProductInput): Promise<ProductRecord> {
  assertValid(input);

  const handle = await uniqueHandle("product", input.title);
  const tags = withChannels(input.tags ?? [], input.channels ?? []);

  const row = await db.product.create({
    data: {
      handle,
      title: input.title.trim(),
      descriptionHtml: input.descriptionHtml ?? "",
      status: input.status ?? "ACTIVE",
      vendor: input.vendor ?? "",
      brand: input.brand ?? "",
      model: input.model ?? "",
      productType: input.productType ?? "",
      tags,
      sku: input.sku?.trim() ?? "",
      barcode: input.barcode?.trim() ?? "",
      price: money2(input.price),
      compareAtPrice: input.compareAtPrice ?? null,
      ...tierData(input.tiers),
      stock: Math.round(input.stock ?? 0),
      images: input.images?.length
        ? {
            create: input.images.map((img, i) => ({
              url: img.url,
              alt: img.alt ?? "",
              position: i,
            })),
          }
        : undefined,
      collections: input.collectionIds?.length
        ? {
            create: input.collectionIds.map((collectionId) => ({
              collectionId,
            })),
          }
        : undefined,
    },
    include: withFirstImage,
  });

  // Auto-file the new product into any smart-rule collection it matches.
  await applySmartRules([row.id]).catch(() => {});
  return toRecord(row);
}

export async function updateProduct(
  id: string,
  input: Partial<ProductInput>,
): Promise<ProductRecord> {
  assertValid(input);

  const existing = await db.product.findUnique({
    where: { id },
    select: { id: true, tags: true },
  });
  if (!existing) throw notFound("product");

  // Channels are stored as tags, so a channel edit must merge rather than
  // replace — otherwise it would wipe segment tags and hand-added tags.
  const tags =
    input.channels !== undefined
      ? withChannels(input.tags ?? existing.tags, input.channels)
      : input.tags;

  const row = await db.product.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.descriptionHtml !== undefined
        ? { descriptionHtml: input.descriptionHtml }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.vendor !== undefined ? { vendor: input.vendor } : {}),
      ...(input.brand !== undefined ? { brand: input.brand } : {}),
      ...(input.model !== undefined ? { model: input.model } : {}),
      ...(input.productType !== undefined
        ? { productType: input.productType }
        : {}),
      ...(tags !== undefined ? { tags } : {}),
      ...(input.sku !== undefined ? { sku: input.sku.trim() } : {}),
      ...(input.barcode !== undefined ? { barcode: input.barcode.trim() } : {}),
      ...(input.price !== undefined ? { price: money2(input.price) } : {}),
      ...(input.compareAtPrice !== undefined
        ? { compareAtPrice: input.compareAtPrice }
        : {}),
      ...tierData(input.tiers),
      ...(input.stock !== undefined ? { stock: Math.round(input.stock) } : {}),
      ...(input.images !== undefined
        ? {
            images: {
              deleteMany: {},
              create: input.images.map((img, i) => ({
                url: img.url,
                alt: img.alt ?? "",
                position: i,
              })),
            },
          }
        : {}),
      ...(input.collectionIds !== undefined
        ? {
            collections: {
              deleteMany: {},
              create: input.collectionIds.map((collectionId) => ({
                collectionId,
              })),
            },
          }
        : {}),
    },
    include: withFirstImage,
  });

  // A type/brand/tag edit may bring the product into a smart collection.
  await applySmartRules([row.id]).catch(() => {});
  return toRecord(row);
}

/* -------------------------------------------------------------------------- */
/* Bulk operations                                                            */
/* -------------------------------------------------------------------------- */

export type BulkResult = { changed: number };

export async function bulkSetStatus(
  ids: string[],
  status: ProductStatus,
): Promise<BulkResult> {
  const { count } = await db.product.updateMany({
    where: { id: { in: ids } },
    data: { status },
  });
  return { changed: count };
}

export async function bulkDelete(ids: string[]): Promise<BulkResult> {
  // Products referenced by an invoice line are archived rather than deleted:
  // the line snapshots its own title and price, but keeping the row means the
  // "view product" link on an old invoice still resolves.
  const referenced = await db.invoiceLine.findMany({
    where: { productId: { in: ids } },
    distinct: ["productId"],
    select: { productId: true },
  });
  const keep = new Set(
    referenced.map((r) => r.productId).filter((v): v is string => v !== null),
  );

  const deletable = ids.filter((id) => !keep.has(id));
  const archivable = ids.filter((id) => keep.has(id));

  const [deleted, archived] = await Promise.all([
    deletable.length
      ? db.product.deleteMany({ where: { id: { in: deletable } } })
      : Promise.resolve({ count: 0 }),
    archivable.length
      ? db.product.updateMany({
          where: { id: { in: archivable } },
          data: { status: "ARCHIVED" },
        })
      : Promise.resolve({ count: 0 }),
  ]);

  return { changed: deleted.count + archived.count };
}

export async function bulkSetPrice(
  ids: string[],
  price: number,
): Promise<BulkResult> {
  if (!Number.isFinite(price) || price < 0) {
    throw invalid("Enter a price of zero or more.");
  }
  const { count } = await db.product.updateMany({
    where: { id: { in: ids } },
    data: { price: money2(price) },
  });
  return { changed: count };
}

export async function bulkSetStock(
  ids: string[],
  stock: number,
): Promise<BulkResult> {
  const { count } = await db.product.updateMany({
    where: { id: { in: ids } },
    data: { stock: Math.max(0, Math.round(stock)) },
  });
  return { changed: count };
}

export async function bulkAddToCollection(
  ids: string[],
  collectionId: string,
): Promise<BulkResult> {
  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    select: { id: true },
  });
  if (!collection) throw notFound("collection");

  // skipDuplicates keeps re-adding a product a no-op rather than an error, so
  // selecting "all" twice is harmless.
  const result = await db.collectionProduct.createMany({
    data: ids.map((productId) => ({ collectionId, productId })),
    skipDuplicates: true,
  });
  return { changed: result.count };
}

export async function bulkSetChannels(
  ids: string[],
  channels: ChannelKey[],
): Promise<BulkResult> {
  const rows = await db.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, tags: true },
  });

  await db.$transaction(
    rows.map((r) =>
      db.product.update({
        where: { id: r.id },
        data: { tags: withChannels(r.tags, channels) },
      }),
    ),
  );

  return { changed: rows.length };
}

/**
 * Fill empty barcodes from the SKU, or generate an internal code when there is
 * no SKU either. Never overwrites an existing barcode unless asked — a printed
 * shelf label must keep matching the product.
 */
export async function assignBarcodes(
  ids: string[],
  opts: { overwrite?: boolean } = {},
): Promise<BulkResult> {
  const rows = await db.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, sku: true, barcode: true },
  });

  const targets = rows.filter((r) => opts.overwrite || !r.barcode.trim());
  if (targets.length === 0) return { changed: 0 };

  await db.$transaction(
    targets.map((r, i) =>
      db.product.update({
        where: { id: r.id },
        data: {
          barcode:
            r.sku.trim() ||
            // Internal code: time-based so it stays unique across sessions.
            `INT${Date.now().toString(36).toUpperCase()}${String(i).padStart(3, "0")}`,
        },
      }),
    ),
  );

  return { changed: targets.length };
}

/* -------------------------------------------------------------------------- */
/* Duplicate detection & merge                                                */
/* -------------------------------------------------------------------------- */

export type DuplicateMember = {
  id: string;
  title: string;
  sku: string;
  barcode: string;
  stock: number;
  price: number;
  status: string;
  imageUrl: string | null;
  /** How many invoice lines reference this product — history that a merge keeps. */
  lineCount: number;
  /** When the product was created — drives the Newest/Oldest hints at merge time. */
  createdAt: string;
};

export type DuplicateGroup = {
  /** Why these were grouped: an identical SKU, or an identical name. */
  reason: "sku" | "title";
  key: string;
  members: DuplicateMember[];
};

const normTitle = (t: string): string => t.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Find sets of products that look like duplicates of each other: two or more
 * sharing a (non-empty) SKU, or an identical name once case and spacing are
 * ignored. SKU groups come first as the stronger signal; a title group whose
 * exact membership is already covered by a SKU group is dropped so a pair that
 * matches on both isn't listed twice.
 */
export async function findDuplicateGroups(): Promise<DuplicateGroup[]> {
  const rows = await db.product.findMany({
    orderBy: { title: "asc" },
    select: {
      id: true,
      title: true,
      sku: true,
      barcode: true,
      stock: true,
      price: true,
      status: true,
      createdAt: true,
      images: { orderBy: { position: "asc" }, take: 1, select: { url: true } },
      _count: { select: { lines: true } },
    },
  });

  type Row = (typeof rows)[number];
  const toMember = (r: Row): DuplicateMember => ({
    id: r.id,
    title: r.title,
    sku: r.sku,
    barcode: r.barcode,
    stock: r.stock,
    price: num(r.price),
    status: r.status,
    imageUrl: r.images[0]?.url ?? null,
    lineCount: r._count.lines,
    createdAt: r.createdAt.toISOString(),
  });

  const bySku = new Map<string, Row[]>();
  const byTitle = new Map<string, Row[]>();
  const push = (m: Map<string, Row[]>, k: string, r: Row) => {
    const a = m.get(k);
    if (a) a.push(r);
    else m.set(k, [r]);
  };
  for (const r of rows) {
    const sku = r.sku.trim().toLowerCase();
    if (sku) push(bySku, sku, r);
    const t = normTitle(r.title);
    if (t) push(byTitle, t, r);
  }

  const sig = (list: Row[]) => list.map((r) => r.id).sort().join(",");
  const seen = new Set<string>();
  const groups: DuplicateGroup[] = [];

  for (const [key, list] of bySku) {
    if (list.length < 2) continue;
    seen.add(sig(list));
    groups.push({ reason: "sku", key, members: list.map(toMember) });
  }
  for (const [key, list] of byTitle) {
    if (list.length < 2) continue;
    if (seen.has(sig(list))) continue;
    groups.push({ reason: "title", key, members: list.map(toMember) });
  }

  // SKU groups first, then the biggest groups — the worst offenders on top.
  groups.sort((a, b) =>
    a.reason === b.reason
      ? b.members.length - a.members.length
      : a.reason === "sku"
        ? -1
        : 1,
  );
  return groups;
}

export type MergeResult = {
  survivorId: string;
  mergedCount: number;
  linesMoved: number;
  collectionsAdded: number;
  imagesMoved: number;
  stockAdded: number;
  /** The product whose details (price, name, SKU…) were applied to the survivor. */
  detailsFrom: string;
  /** Field names whose value changed on the survivor as a result of the merge. */
  updatedFields: string[];
};

/**
 * Merge `mergedIds` into `survivorId`: the survivor absorbs the others and they
 * are deleted. Because an invoice line snapshots its own title and price, moving
 * a line to the survivor keeps every past bill printing exactly as it did.
 *
 * Two independent choices:
 *  - `survivorId` — which record REMAINS (keeps its id, so all its invoice
 *    history and links stay intact).
 *  - `detailsFrom` — which record's DETAILS win (name, price, tiers, SKU,
 *    barcode, brand, …). Defaults to the survivor. Set it to a merged product
 *    to keep, say, the latest record's price while still keeping the older
 *    record's history. Fields are resolved by priority: the details source
 *    first, then the survivor, then the other merged records — the first
 *    non-empty value wins, so nothing gets blanked out.
 *
 * Also transfers: collection memberships and tags (unioned) and — only when the
 * survivor has no image — the first merged product's images. Stock stays the
 * survivor's unless `addStock` rolls the others' in. All in one transaction.
 */
export async function mergeProducts(
  survivorId: string,
  mergedIds: string[],
  opts: { addStock?: boolean; detailsFrom?: string } = {},
): Promise<MergeResult> {
  const losers = [...new Set(mergedIds)].filter((id) => id !== survivorId);
  if (losers.length === 0) {
    throw invalid("Pick at least one other product to merge into the survivor.");
  }
  // The details source must be one of the products in the merge.
  const detailsFrom =
    opts.detailsFrom && (opts.detailsFrom === survivorId || losers.includes(opts.detailsFrom))
      ? opts.detailsFrom
      : survivorId;

  // Everything the merge reads or backfills, so a merge preserves data instead
  // of dropping whatever the survivor happened to be missing.
  const mergeSelect = {
    id: true,
    tags: true,
    stock: true,
    title: true,
    sku: true,
    barcode: true,
    brand: true,
    model: true,
    vendor: true,
    productType: true,
    descriptionHtml: true,
    price: true,
    compareAtPrice: true,
    priceWholesale: true,
    priceShop: true,
    priceEbay: true,
    priceAmazon: true,
    collections: { select: { collectionId: true } },
    images: { orderBy: { position: "asc" as const }, select: { id: true } },
  };

  const [survivor, others] = await Promise.all([
    db.product.findUnique({ where: { id: survivorId }, select: mergeSelect }),
    db.product.findMany({ where: { id: { in: losers } }, select: mergeSelect }),
  ]);
  if (!survivor) throw notFound("product");
  if (others.length === 0) throw notFound("product");

  // Order the merged records by the caller's mergedIds, so field resolution is
  // deterministic.
  const orderedOthers = losers
    .map((id) => others.find((o) => o.id === id))
    .filter((o): o is (typeof others)[number] => o != null);

  // Field resolution priority: the details source first, then the survivor, then
  // the remaining merged records. The first non-empty value wins, so choosing a
  // merged record as the details source overrides the survivor where it has a
  // value, but never blanks a field the source left empty.
  type Rec = typeof survivor;
  const all: Rec[] = [survivor, ...orderedOthers];
  const source = all.find((p) => p.id === detailsFrom) ?? survivor;
  const priority: Rec[] = [source, ...all.filter((p) => p.id !== detailsFrom)];

  const pickText = (
    key: "title" | "sku" | "barcode" | "brand" | "model" | "vendor" | "productType" | "descriptionHtml",
  ): string => {
    for (const p of priority) {
      const v = (p[key] ?? "").trim();
      if (v) return v;
    }
    return "";
  };
  const pickDecimal = (
    key: "compareAtPrice" | "priceWholesale" | "priceShop" | "priceEbay" | "priceAmazon",
  ): Prisma.Decimal | null => {
    for (const p of priority) {
      if (p[key] != null) return p[key] as Prisma.Decimal;
    }
    return null;
  };
  const sameDec = (a: Prisma.Decimal | null, b: Prisma.Decimal | null) =>
    (a == null && b == null) || (a != null && b != null && Number(a) === Number(b));

  const result = await db.$transaction(async (tx) => {
    // 1. Move invoice history onto the survivor. Snapshots keep old bills intact.
    const lines = await tx.invoiceLine.updateMany({
      where: { productId: { in: losers } },
      data: { productId: survivorId },
    });

    // 2. Union collection memberships onto the survivor.
    const collIds = [
      ...new Set(orderedOthers.flatMap((o) => o.collections.map((c) => c.collectionId))),
    ];
    let collectionsAdded = 0;
    if (collIds.length) {
      const r = await tx.collectionProduct.createMany({
        data: collIds.map((collectionId) => ({ collectionId, productId: survivorId })),
        skipDuplicates: true,
      });
      collectionsAdded = r.count;
    }

    // 3. Adopt images only if the survivor has none, so a good photo isn't lost.
    let imagesMoved = 0;
    if (survivor.images.length === 0) {
      const donor = orderedOthers.find((o) => o.images.length > 0);
      if (donor) {
        const r = await tx.productImage.updateMany({
          where: { id: { in: donor.images.map((i) => i.id) } },
          data: { productId: survivorId },
        });
        imagesMoved = r.count;
      }
    }

    // 4. Union tags; apply the resolved details to the survivor (this is where a
    //    chosen details source's price/name/SKU wins); optionally roll in stock.
    const tags = [...new Set([...survivor.tags, ...orderedOthers.flatMap((o) => o.tags)])];
    const stockAdded = opts.addStock ? orderedOthers.reduce((s, o) => s + o.stock, 0) : 0;

    const data: Prisma.ProductUpdateInput = { tags };
    const updatedFields: string[] = [];

    const TEXT = ["title", "sku", "barcode", "brand", "model", "vendor", "productType", "descriptionHtml"] as const;
    for (const k of TEXT) {
      const v = pickText(k);
      if (v !== (survivor[k] ?? "")) {
        (data as Record<string, unknown>)[k] = v;
        updatedFields.push(k);
      }
    }
    // Base price is required, so it always resolves to the source's price.
    const price = priority[0].price;
    if (!sameDec(price, survivor.price)) {
      data.price = price;
      updatedFields.push("price");
    }
    const DEC = ["compareAtPrice", "priceWholesale", "priceShop", "priceEbay", "priceAmazon"] as const;
    for (const k of DEC) {
      const v = pickDecimal(k);
      if (!sameDec(v, survivor[k])) {
        (data as Record<string, unknown>)[k] = v;
        updatedFields.push(k);
      }
    }
    if (stockAdded) data.stock = survivor.stock + stockAdded;

    await tx.product.update({ where: { id: survivorId }, data });

    // 5. Delete the losers — cascades any leftover images and collection rows.
    await tx.product.deleteMany({ where: { id: { in: losers } } });

    return { linesMoved: lines.count, collectionsAdded, imagesMoved, stockAdded, updatedFields };
  });

  await audit("product.merge", {
    ref: survivorId,
    detail:
      `Merged ${orderedOthers.length} product${orderedOthers.length === 1 ? "" : "s"} in; ` +
      `${result.linesMoved} invoice line${result.linesMoved === 1 ? "" : "s"} moved` +
      (detailsFrom !== survivorId ? "; kept the other record's details" : "") +
      (result.stockAdded ? `; +${result.stockAdded} stock` : "") +
      (result.updatedFields.length ? `; updated ${result.updatedFields.join(", ")}` : "") +
      ".",
    data: {
      survivorId,
      detailsFrom,
      merged: orderedOthers.map((o) => ({ id: o.id, title: o.title, sku: o.sku })),
      ...result,
    },
  }).catch(() => {});

  // The survivor's unioned tags may now satisfy a rule-based collection.
  await applySmartRules([survivorId]).catch(() => {});

  return { survivorId, mergedCount: orderedOthers.length, detailsFrom, ...result };
}

export type BatchMergeResult = {
  groupsMerged: number;
  productsRemoved: number;
  linesMoved: number;
};

/**
 * Merge every duplicate group in one pass, keeping the newest or the oldest
 * record of each and folding the rest in. The kept record is also the details
 * source, so "keep newest" keeps the latest details — the common case after
 * re-adding a product with updated pricing.
 *
 * Groups can overlap (a product may share a SKU with one and a name with
 * another), so already-merged products are tracked and skipped rather than
 * re-scanning after every merge. A group that drops below two live members is
 * left alone.
 */
export async function mergeDuplicatesAuto(
  strategy: "newest" | "oldest",
  opts: { addStock?: boolean } = {},
): Promise<BatchMergeResult> {
  const groups = await findDuplicateGroups();
  const gone = new Set<string>();
  let groupsMerged = 0;
  let productsRemoved = 0;
  let linesMoved = 0;

  for (const g of groups) {
    const live = g.members.filter((m) => !gone.has(m.id));
    if (live.length < 2) continue;

    const sorted = [...live].sort((a, b) =>
      strategy === "newest"
        ? +new Date(b.createdAt) - +new Date(a.createdAt)
        : +new Date(a.createdAt) - +new Date(b.createdAt),
    );
    const survivor = sorted[0];
    const mergedIds = sorted.slice(1).map((m) => m.id);

    const res = await mergeProducts(survivor.id, mergedIds, {
      addStock: opts.addStock,
      detailsFrom: survivor.id,
    });
    groupsMerged++;
    productsRemoved += mergedIds.length;
    linesMoved += res.linesMoved;
    for (const id of mergedIds) gone.add(id);
  }

  return { groupsMerged, productsRemoved, linesMoved };
}

/**
 * Authoritative merge information for a set of products — current stock, status,
 * price, image and the live count of invoice lines referencing each. The merge
 * modal fetches this so it never shows a stale figure or, worse, claims "no
 * invoice history" for a product that in fact appears on past bills.
 */
export async function getMergeCandidates(ids: string[]): Promise<DuplicateMember[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const rows = await db.product.findMany({
    where: { id: { in: unique } },
    select: {
      id: true,
      title: true,
      sku: true,
      barcode: true,
      stock: true,
      price: true,
      status: true,
      createdAt: true,
      images: { orderBy: { position: "asc" }, take: 1, select: { url: true } },
      _count: { select: { lines: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    sku: r.sku,
    barcode: r.barcode,
    stock: r.stock,
    price: num(r.price),
    status: r.status,
    imageUrl: r.images[0]?.url ?? null,
    lineCount: r._count.lines,
    createdAt: r.createdAt.toISOString(),
  }));
}

/* -------------------------------------------------------------------------- */
/* Excel columns                                                              */
/* -------------------------------------------------------------------------- */

export const EXPORT_COLUMNS = [
  { key: "handle", header: "Handle (leave blank for new)", width: 26 },
  { key: "title", header: "Title", width: 40 },
  { key: "brand", header: "Brand", width: 18 },
  { key: "model", header: "Model", width: 22 },
  { key: "productType", header: "Type", width: 20 },
  { key: "vendor", header: "Vendor", width: 18 },
  { key: "description", header: "Description", width: 50 },
  { key: "tags", header: "Tags", width: 26 },
  { key: "sku", header: "SKU", width: 18 },
  { key: "barcode", header: "Barcode", width: 18 },
  { key: "price", header: "Price", width: 12 },
  { key: "compareAtPrice", header: "Compare at", width: 12 },
  { key: "priceWholesale", header: "Wholesale", width: 12 },
  { key: "priceShop", header: "In shop", width: 12 },
  { key: "priceEbay", header: "eBay", width: 12 },
  { key: "priceAmazon", header: "Amazon", width: 12 },
  { key: "stock", header: "Stock", width: 10 },
  { key: "status", header: "Status", width: 12 },
  { key: "imageUrl", header: "Image URL", width: 40 },
  { key: "collections", header: "Collections", width: 30 },
] as const;

export type ExportColumnKey = (typeof EXPORT_COLUMNS)[number]["key"];
