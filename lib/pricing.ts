/**
 * Multi-tier pricing. CLIENT-SAFE — the till, the product editor and the Excel
 * importer all share this file, so the same price is computed the same way in
 * every one of them.
 *
 * One product carries five prices: the base price (standard retail) plus four
 * tier columns on the product row. A blank tier is not zero — it
 * falls back to the base price. That distinction is the whole model: a shop
 * that has not set an eBay price still sells on eBay, at retail.
 */

export type TierKey = "wholesale" | "shop" | "ebay" | "amazon";

export type TierDef = {
  key: TierKey;
  label: string;
  /** Cramped table headers and mobile chips. */
  short: string;
  /** Column on the Product table. */
  column: string;
  description: string;
};

export const PRICE_TIERS: TierDef[] = [
  {
    key: "wholesale",
    label: "Wholesale",
    short: "Whsl",
    column: "priceWholesale",
    description: "Trade price for account customers buying in quantity.",
  },
  {
    key: "shop",
    label: "In shop",
    short: "Shop",
    column: "priceShop",
    description: "Counter price for walk-in customers.",
  },
  {
    key: "ebay",
    label: "eBay",
    short: "eBay",
    column: "priceEbay",
    description: "Listing price on eBay, usually covering their fees.",
  },
  {
    key: "amazon",
    label: "Amazon",
    short: "Amzn",
    column: "priceAmazon",
    description: "Listing price on Amazon, usually covering their fees.",
  },
];

export const TIER_KEYS: TierKey[] = PRICE_TIERS.map((t) => t.key);

export type TierPrices = Partial<Record<TierKey, number | null>>;

export const tierDef = (key: TierKey): TierDef =>
  PRICE_TIERS.find((t) => t.key === key)!;

/** Database column → tier definition, for reading rows back. */
export const tierByColumn = (column: string): TierDef | undefined =>
  PRICE_TIERS.find((t) => t.column === column);

/**
 * Parse a stored tier value into a usable price.
 *
 * Returns null for anything that is not a positive number — blank, "0",
 * "n/a", a stray comma. Null means "no tier price", which callers resolve to
 * the base price. Zero is deliberately treated as unset: nobody sells at £0,
 * and a stray 0 in a spreadsheet must not give stock away.
 */
export function tierNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

/* -------------------------------------------------------------------------- */
/* Context → tier                                                             */
/* -------------------------------------------------------------------------- */

export type PriceContext = {
  /** Customer is on trade terms — wholesale beats the channel tier. */
  wholesale?: boolean;
  /** Where the sale is happening. */
  segment?: string;
};

/**
 * Which tier applies to a sale.
 *
 * Wholesale wins over the sale channel: a trade customer buying at the counter
 * pays trade, not the walk-in shop price. That ordering is a business rule, not
 * an accident — do not reorder it without asking the owner.
 */
export function tierForContext(ctx: PriceContext): TierKey | null {
  if (ctx.wholesale) return "wholesale";
  switch (ctx.segment) {
    case "shop":
      return "shop";
    case "ebay":
      return "ebay";
    case "amazon":
      return "amazon";
    case "online":
      return null; // online sells at the base price
    default:
      return null;
  }
}

/** Final unit price for a sale, given the base price and the tier table. */
export function priceForContext(
  base: number,
  tiers: TierPrices | null | undefined,
  ctx: PriceContext,
): number {
  const key = tierForContext(ctx);
  if (!key) return base;
  const tier = tierNum(tiers?.[key]);
  return tier ?? base;
}

/** Every price a product carries, for the inventory grid and exports. */
export function allPrices(
  base: number,
  tiers: TierPrices | null | undefined,
): Record<TierKey | "base", number> {
  return {
    base,
    wholesale: tierNum(tiers?.wholesale) ?? base,
    shop: tierNum(tiers?.shop) ?? base,
    ebay: tierNum(tiers?.ebay) ?? base,
    amazon: tierNum(tiers?.amazon) ?? base,
  };
}

/** True when a tier is explicitly set rather than inherited from base. */
export const tierIsSet = (
  tiers: TierPrices | null | undefined,
  key: TierKey,
): boolean => tierNum(tiers?.[key]) !== null;

/** Margin between a tier and the base price, for the product editor. */
export function tierDelta(
  base: number,
  tiers: TierPrices | null | undefined,
  key: TierKey,
): { amount: number; percent: number } | null {
  const tier = tierNum(tiers?.[key]);
  if (tier === null || base <= 0) return null;
  return {
    amount: Math.round((tier - base) * 100) / 100,
    percent: Math.round(((tier - base) / base) * 1000) / 10,
  };
}
