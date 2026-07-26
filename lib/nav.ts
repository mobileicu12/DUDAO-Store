import { hasPerm, type Me, type PermKey } from "./permissions";

/**
 * Navigation model. CLIENT-SAFE — imported by the sidebar and mobile bar.
 *
 * Layer three of three-layer permission enforcement: items a member cannot use
 * are not rendered. This is purely cosmetic — hiding a link is not access
 * control, it just stops staff walking into a wall.
 */

export type NavGroup = "Overview" | "Sell" | "Catalog" | "Admin";

export const NAV_GROUPS: NavGroup[] = ["Overview", "Sell", "Catalog", "Admin"];

export type NavItem = {
  href: string;
  label: string;
  /** Single SVG path, drawn at 24×24 with stroke width 1.7. */
  icon: string;
  group: NavGroup;
  /** null = visible to anyone signed in. */
  perm: PermKey | null;
  /** Shown in the mobile bottom bar rather than behind "More". */
  primary?: boolean;
  /** Short label for the cramped mobile bar. */
  short?: string;
};

export const NAV: NavItem[] = [
  {
    href: "/portal",
    label: "Dashboard",
    short: "Home",
    icon: "M3.75 9.75 12 3.5l8.25 6.25V19a1.5 1.5 0 0 1-1.5 1.5h-3.75v-6h-6v6H5.25a1.5 1.5 0 0 1-1.5-1.5z",
    group: "Overview",
    perm: null,
    primary: true,
  },

  {
    href: "/portal/billing",
    label: "Till",
    short: "Till",
    icon: "M3.5 7.5h17l-1.2 11a1.5 1.5 0 0 1-1.5 1.35H6.2a1.5 1.5 0 0 1-1.5-1.35zM8.5 7.5V6a3.5 3.5 0 0 1 7 0v1.5",
    group: "Sell",
    perm: "billing",
    primary: true,
  },
  {
    href: "/portal/invoices",
    label: "Invoices",
    short: "Bills",
    icon: "M6.5 3.5h11a1 1 0 0 1 1 1v16l-3-2-2 2-2-2-2 2-3-2v-14a1 1 0 0 1 1-1zM9 8h6M9 12h6",
    group: "Sell",
    perm: "invoices",
    primary: true,
  },
  {
    href: "/portal/customers",
    label: "Customers",
    short: "People",
    icon: "M15.5 8.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0zM4.5 20a7.5 7.5 0 0 1 15 0",
    group: "Sell",
    perm: "customers",
    primary: true,
  },
  {
    href: "/portal/orders",
    label: "Orders",
    icon: "M4.5 6.5h15l-1.5 12h-12zM9 10v6M15 10v6M8.5 6.5 12 2.5l3.5 4",
    group: "Sell",
    perm: "orders",
  },

  {
    href: "/portal/inventory",
    label: "Inventory",
    short: "Stock",
    icon: "M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5zM3.5 7.5 12 12m0 0 8.5-4.5M12 12v9",
    group: "Catalog",
    perm: "inventory",
  },
  {
    href: "/portal/collections",
    label: "Collections",
    icon: "M4 6.5h7v5H4zM13 6.5h7v5h-7zM4 13.5h7v5H4zM13 13.5h7v5h-7z",
    group: "Catalog",
    perm: "collections",
  },
  {
    href: "/portal/import-export",
    label: "Import & export",
    icon: "M12 3.5v10m0 0 3.5-3.5M12 13.5 8.5 10M4.5 15.5v3a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-3",
    group: "Catalog",
    perm: "inventory",
  },

  {
    href: "/portal/channels",
    label: "Channels",
    icon: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM3.5 12h17M12 3.5c2.2 2.4 3.3 5.3 3.3 8.5s-1.1 6.1-3.3 8.5c-2.2-2.4-3.3-5.3-3.3-8.5S9.8 5.9 12 3.5z",
    group: "Admin",
    perm: null,
  },
  {
    href: "/portal/users",
    label: "Team",
    icon: "M9 8.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 8.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM1.5 19a4.5 4.5 0 0 1 9 0M13.5 19a4.5 4.5 0 0 1 9 0",
    group: "Admin",
    perm: "users",
  },
  {
    href: "/portal/settings",
    label: "Settings",
    icon: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V20a2 2 0 1 1-4 0v-.11a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H4a2 2 0 1 1 0-4h.11A1.7 1.7 0 0 0 5.67 7.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H10a1.7 1.7 0 0 0 1-1.56V4a2 2 0 1 1 4 0v.11a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V10a1.7 1.7 0 0 0 1.56 1H20a2 2 0 1 1 0 4h-.11a1.7 1.7 0 0 0-1.49 1.03z",
    group: "Admin",
    perm: "settings",
  },
];

export function visibleNav(items: NavItem[], me: Me | null): NavItem[] {
  if (!me) return [];
  return items.filter((item) => item.perm === null || hasPerm(me, item.perm));
}

export function groupedNav(
  me: Me | null,
): { group: NavGroup; items: NavItem[] }[] {
  const visible = visibleNav(NAV, me);
  return NAV_GROUPS.map((group) => ({
    group,
    items: visible.filter((i) => i.group === group),
  })).filter((g) => g.items.length > 0);
}

/**
 * Page title from the pathname, for the header.
 * Detail routes fall back to their section name — "/portal/invoices/123"
 * reads as "Invoices" rather than as an opaque ID.
 */
export function titleForPath(pathname: string): string {
  const exact = NAV.find((i) => i.href === pathname);
  if (exact) return exact.label;

  if (pathname.startsWith("/portal/products/new")) return "New product";
  if (pathname.startsWith("/portal/products/")) return "Edit product";
  if (pathname === "/portal/tap-in") return "Start shift";

  const section = NAV.filter(
    (i) => i.href !== "/portal" && pathname.startsWith(`${i.href}/`),
  ).sort((a, b) => b.href.length - a.href.length)[0];

  return section?.label ?? "Portal";
}
