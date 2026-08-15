import "server-only";
import { cookies } from "next/headers";
import { db, num, numOrNull } from "@/lib/db";
import { toRecord, type ProductRecord } from "@/lib/products";
import { priceForContext } from "@/lib/pricing";
import { createBill } from "@/lib/billing";
import { computeTotals } from "@/lib/billing-shared";
import { TRADE_COOKIE, readTradeCookie } from "@/lib/trade-session";

/**
 * Storefront data layer. Everything the public /shop side reads or writes goes
 * through here, so the trade-price rule and the "must be seg:online" gate live
 * in exactly one place.
 */

export type TradeCustomer = {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  outstanding: number;
};

const withFirstImage = {
  images: { orderBy: { position: "asc" as const }, take: 1 },
};

/** True when a customer is approved for trade — i.e. carries seg:online. */
const isTrade = (segments: string[]): boolean => segments.includes("online");

/**
 * The signed-in trade customer, or null. A cookie that verifies but points at
 * a customer who has since lost seg:online returns null — approval can be
 * revoked and the storefront must honour that immediately.
 */
export async function currentTradeCustomer(): Promise<TradeCustomer | null> {
  const store = await cookies();
  const id = readTradeCookie(store.get(TRADE_COOKIE)?.value);
  if (!id) return null;

  const row = await db.customer.findUnique({
    where: { id },
    include: {
      invoices: {
        where: { status: { not: "VOID" } },
        include: { lines: true },
      },
      payments: { where: { revoked: false }, select: { amount: true } },
    },
  });
  if (!row || !isTrade(row.segments)) return null;

  const billed = row.invoices.reduce(
    (s, inv) =>
      s +
      computeTotals({
        lines: inv.lines.map((l) => ({
          quantity: l.quantity,
          unitPrice: num(l.unitPrice),
        })),
        discount: num(inv.discount),
        taxable: inv.taxable,
        taxRate: num(inv.taxRate),
        paid: 0,
      }).total,
    0,
  );
  const paid = row.payments.reduce((s, p) => s + num(p.amount), 0);
  const outstanding = Math.max(
    0,
    Math.round((num(row.openingBalance) + billed - paid) * 100) / 100,
  );

  return {
    id: row.id,
    name: row.name,
    company: row.company,
    email: row.email,
    phone: row.phone,
    outstanding,
  };
}

/** Wholesale unit price for a product — what a trade customer pays. */
export const wholesalePrice = (p: ProductRecord): number =>
  priceForContext(p.price, p.tiers, { wholesale: true });

export type ShopListArgs = {
  q?: string;
  type?: string;
  take?: number;
  skip?: number;
};

export type ShopListResult = {
  items: ProductRecord[];
  total: number;
};

/** Active, sellable products for the storefront grid. */
export async function shopProducts(args: ShopListArgs = {}): Promise<ShopListResult> {
  const take = Math.min(Math.max(args.take ?? 24, 1), 60);
  const q = (args.q ?? "").trim();

  const where = {
    status: "ACTIVE" as const,
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" as const } },
            { sku: { contains: q, mode: "insensitive" as const } },
            { brand: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(args.type ? { productType: args.type } : {}),
  };

  const [rows, total] = await Promise.all([
    db.product.findMany({
      where,
      include: withFirstImage,
      orderBy: { title: "asc" },
      take,
      skip: args.skip ?? 0,
    }),
    db.product.count({ where }),
  ]);

  return { items: rows.map(toRecord), total };
}

/** A single active product for its detail page. */
export type ShopProductDetail = {
  record: ProductRecord;
  /** Every image on the product, in order, for the gallery. */
  gallery: string[];
  descriptionHtml: string;
};

export async function shopProduct(id: string): Promise<ShopProductDetail | null> {
  const row = await db.product.findFirst({
    where: { id, status: "ACTIVE" },
    include: { images: { orderBy: { position: "asc" } } },
  });
  if (!row) return null;
  const gallery = row.images.map((img) => img.url).filter(Boolean);
  // toRecord keeps the first image for `imageUrl`; the gallery carries them all.
  return {
    record: toRecord({ ...row, images: row.images.slice(0, 1) }),
    gallery,
    descriptionHtml: row.descriptionHtml,
  };
}

export type ShopCollectionCard = {
  id: string;
  handle: string;
  title: string;
  imageUrl: string | null;
  count: number;
};

/** Collections that have at least one active product, for the browse index. */
export async function shopCollections(): Promise<ShopCollectionCard[]> {
  const rows = await db.collection.findMany({
    orderBy: { title: "asc" },
    include: {
      products: {
        where: { product: { status: "ACTIVE" } },
        orderBy: { position: "asc" },
        include: {
          product: { include: { images: { orderBy: { position: "asc" }, take: 1 } } },
        },
      },
    },
  });

  return rows
    .map((c) => ({
      id: c.id,
      handle: c.handle,
      title: c.title,
      // Fall back to the first product's image when the collection has no cover.
      imageUrl: c.imageUrl || c.products[0]?.product.images[0]?.url || null,
      count: c.products.length,
    }))
    .filter((c) => c.count > 0);
}

export type ShopCollection = {
  id: string;
  handle: string;
  title: string;
  descriptionHtml: string;
  imageUrl: string | null;
  items: ProductRecord[];
};

/** A single collection with its active products, for /shop/c/[handle]. */
export async function shopCollection(handle: string): Promise<ShopCollection | null> {
  const row = await db.collection.findUnique({
    where: { handle },
    include: {
      products: {
        where: { product: { status: "ACTIVE" } },
        orderBy: { position: "asc" },
        include: {
          product: { include: { images: { orderBy: { position: "asc" }, take: 1 } } },
        },
      },
    },
  });
  if (!row) return null;

  return {
    id: row.id,
    handle: row.handle,
    title: row.title,
    descriptionHtml: row.descriptionHtml,
    imageUrl: row.imageUrl || null,
    items: row.products.map((cp) => toRecord(cp.product)),
  };
}

/** Distinct product types among active products, for the browse filter. */
export async function shopProductTypes(): Promise<string[]> {
  const rows = await db.product.findMany({
    where: { status: "ACTIVE", productType: { not: "" } },
    select: { productType: true },
    distinct: ["productType"],
    orderBy: { productType: "asc" },
  });
  return rows.map((r) => r.productType);
}

export type CheckoutLine = { productId: string; quantity: number };
export type CheckoutMethod = "cash" | "bank" | "account";

const METHOD_LABEL: Record<CheckoutMethod, string> = {
  cash: "Cash on collection",
  bank: "Bank transfer",
  account: "On account",
};

/**
 * Turn a storefront cart into an unpaid trade invoice. Prices are re-derived
 * server-side from the catalog at the wholesale tier — the browser never gets
 * to name a price. No money is taken here; the invoice lands in the portal's
 * Invoices list as UNPAID with the chosen settlement method noted.
 */
export async function createTradeCheckout(args: {
  customer: TradeCustomer;
  lines: CheckoutLine[];
  method: CheckoutMethod;
  note?: string;
}) {
  const wanted = args.lines
    .map((l) => ({ productId: String(l.productId), quantity: Math.floor(Number(l.quantity)) }))
    .filter((l) => l.productId && l.quantity > 0);

  if (wanted.length === 0) {
    throw Object.assign(new Error("Your basket is empty."), { status: 400 });
  }

  const products = await db.product.findMany({
    where: { id: { in: wanted.map((l) => l.productId) }, status: "ACTIVE" },
    include: withFirstImage,
  });
  const byId = new Map(products.map((p) => [p.id, toRecord(p)]));

  const lines = wanted
    .map((l) => {
      const p = byId.get(l.productId);
      if (!p) return null;
      return {
        productId: p.id,
        title: p.title,
        sku: p.sku,
        quantity: l.quantity,
        unitPrice: wholesalePrice(p),
      };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);

  if (lines.length === 0) {
    throw Object.assign(new Error("None of the basket items are available."), {
      status: 400,
    });
  }

  const noteParts = [
    "Storefront trade order",
    `Settle by: ${METHOD_LABEL[args.method]}`,
    args.note?.trim() ? `Customer note: ${args.note.trim()}` : "",
  ].filter(Boolean);

  return createBill({
    customerId: args.customer.id,
    segment: "online",
    lines,
    taxable: false,
    taxRate: 0,
    discount: 0,
    notes: noteParts.join(" · "),
    staffEmail: "storefront",
    staffName: "Storefront",
    payment: null,
    // The credit limit is enforced for "on account" orders, which defer
    // payment. Cash-on-collection and bank transfer are paid before the goods
    // leave, so they are not blocked by an existing balance.
    overrideCreditLimit: args.method !== "account",
  });
}

/** A trade customer's own order history and profile, for /shop/account. */
export async function tradeAccount(customerId: string) {
  const row = await db.customer.findUnique({
    where: { id: customerId },
    include: {
      invoices: {
        where: { status: { not: "VOID" } },
        include: { lines: true, payments: { where: { revoked: false } } },
        orderBy: { issuedAt: "desc" },
        take: 50,
      },
    },
  });
  if (!row) return null;

  const orders = row.invoices.map((inv) => {
    const totals = computeTotals({
      lines: inv.lines.map((l) => ({
        quantity: l.quantity,
        unitPrice: num(l.unitPrice),
      })),
      discount: num(inv.discount),
      taxable: inv.taxable,
      taxRate: num(inv.taxRate),
      paid: inv.payments.reduce((s, p) => s + num(p.amount), 0),
    });
    return {
      id: inv.id,
      number: inv.number,
      status: inv.status,
      issuedAt: inv.issuedAt.toISOString(),
      total: totals.total,
      paid: totals.paid,
      balance: totals.balance,
      itemCount: inv.lines.length,
    };
  });

  return {
    profile: {
      id: row.id,
      name: row.name,
      company: row.company,
      email: row.email,
      phone: row.phone,
    },
    orders,
    openingBalance: num(row.openingBalance),
    creditLimit: numOrNull(row.creditLimit),
  };
}
