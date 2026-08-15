/**
 * Feature permissions.
 *
 * CLIENT-SAFE — this file is imported by the sidebar, the team screen and the
 * edge-ish proxy. It must never import anything server-only (no Shopify, no
 * node:crypto), or the proxy bundle breaks.
 */

export type PermKey =
  | "inventory"
  | "billing"
  | "invoices"
  | "orders"
  | "customers"
  | "collections"
  | "reports"
  | "settings"
  | "users"
  | "logs";

export type PermDef = {
  key: PermKey;
  label: string;
  description: string;
};

export const PERMISSIONS: PermDef[] = [
  {
    key: "billing",
    label: "Till & billing",
    description: "Ring up sales, take payments and raise invoices at the counter.",
  },
  {
    key: "invoices",
    label: "Invoices",
    description: "Open past invoices, edit unpaid ones, record and revoke payments.",
  },
  {
    key: "customers",
    label: "Customers",
    description: "View accounts, edit details and manage the payment ledger.",
  },
  {
    key: "orders",
    label: "Orders",
    description: "See completed orders from every channel, fulfil and refund.",
  },
  {
    key: "inventory",
    label: "Inventory & products",
    description: "Add and edit products, adjust stock and prices, print labels.",
  },
  {
    key: "collections",
    label: "Collections",
    description: "Group products into categories and manage collection pages.",
  },
  {
    key: "reports",
    label: "Reports & takings",
    description:
      "See all-time sales totals and business reports. Without this, staff see only today's takings and outstanding balances.",
  },
  {
    key: "settings",
    label: "Settings",
    description: "Change business details, tax rate, invoice numbering and messaging.",
  },
  {
    key: "users",
    label: "Team",
    description: "Invite staff, set passwords and decide who can do what.",
  },
  {
    key: "logs",
    label: "Activity log",
    description:
      "See the audit trail of every invoice and payment change, and restore deleted invoices. Grant this without handing over Settings.",
  },
];

export const ALL_PERMS: PermKey[] = PERMISSIONS.map((p) => p.key);

/**
 * What a new hire starts with: they can serve customers and look things up,
 * but cannot see all-time takings, change settings or manage the team.
 */
export const DEFAULT_MEMBER_PERMS: PermKey[] = [
  "billing",
  "invoices",
  "customers",
  "orders",
  "inventory",
];

export const permLabel = (key: PermKey): string =>
  PERMISSIONS.find((p) => p.key === key)?.label ?? key;

export const permDescription = (key: PermKey): string =>
  PERMISSIONS.find((p) => p.key === key)?.description ?? "";

/** Narrow arbitrary stored JSON back to real permission keys. */
export function sanitizePerms(input: unknown): PermKey[] {
  if (!Array.isArray(input)) return [];
  const valid = new Set<string>(ALL_PERMS);
  return Array.from(
    new Set(input.filter((v): v is PermKey => typeof v === "string" && valid.has(v))),
  );
}

export type Role = "owner" | "member";

/** The shape the browser is allowed to see for the signed-in user. */
export type Me = {
  email: string;
  name: string;
  image?: string | null;
  role: Role;
  permissions: PermKey[];
};

export function hasPerm(me: Me | null | undefined, perm: PermKey): boolean {
  if (!me) return false;
  if (me.role === "owner") return true;
  return me.permissions.includes(perm);
}

export function hasAnyPerm(
  me: Me | null | undefined,
  perms: PermKey[],
): boolean {
  if (!me) return false;
  if (me.role === "owner") return true;
  return perms.some((p) => me.permissions.includes(p));
}

/**
 * The financial gate.
 *
 * Counter staff must be able to do their job — take money, see what a customer
 * still owes — without being able to read the shop's all-time turnover. Only
 * the owner or someone holding `reports` sees lifetime totals.
 */
export function canSeeFinance(me: Me | null | undefined): boolean {
  return hasPerm(me, "reports");
}
