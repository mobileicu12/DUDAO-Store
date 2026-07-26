import "server-only";
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
    },
    include: { _count: { select: { products: true } } },
  });

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
    },
  });
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
