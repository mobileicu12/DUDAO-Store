import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authConfig } from "./auth.config";
import type { PermKey } from "./lib/permissions";
import { MASTER_COOKIE, verifyMaster } from "./lib/master-token";

/**
 * Layer one of three-layer permission enforcement.
 *
 * This gates PAGE NAVIGATION by URL prefix. It is a convenience, not the
 * security boundary — a member who types an API URL directly never touches
 * this file. Every mutating route re-checks with lib/guard.ts. Do not remove
 * that check on the grounds that "the proxy already handles it"; that is the
 * single most common way this kind of app leaks data.
 *
 * Next 16 renamed middleware.ts to proxy.ts and runs it on the Node runtime.
 * We still build it from the lean auth.config so it never reaches the database.
 */

const { auth } = NextAuth(authConfig);

/** Reachable without a session. */
const PUBLIC_PREFIXES = [
  "/login",
  "/no-access",
  "/api/auth",
  "/api/login",
  "/api/me",
  "/api/cron",
  "/api/public",
];

/** URL prefix → permission required to open it. Longest prefix wins. */
const GATE: { prefix: string; perm: PermKey }[] = [
  { prefix: "/portal/billing", perm: "billing" },
  { prefix: "/portal/invoices", perm: "invoices" },
  { prefix: "/portal/customers", perm: "customers" },
  { prefix: "/portal/orders", perm: "orders" },
  { prefix: "/portal/inventory", perm: "inventory" },
  { prefix: "/portal/products", perm: "inventory" },
  { prefix: "/portal/import-export", perm: "inventory" },
  { prefix: "/portal/collections", perm: "collections" },
  { prefix: "/portal/settings", perm: "settings" },
  { prefix: "/portal/users", perm: "users" },
];

const isPublic = (pathname: string): boolean =>
  pathname === "/" ||
  PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

/** Pass the current path down so server components can highlight the nav. */
function withPathname(req: NextRequest): NextResponse {
  const headers = new Headers(req.headers);
  headers.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export default auth((req) => {
  const { pathname, search } = req.nextUrl;

  if (isPublic(pathname)) return withPathname(req);

  // Master-password cookie stands in for a full owner session.
  const master = verifyMaster(req.cookies.get(MASTER_COOKIE)?.value);
  const session = req.auth;

  if (!session?.user && !master) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("from", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  // Owners and master-cookie holders skip the feature gate entirely.
  const role = session?.user?.role;
  if (master || role === "owner") return withPathname(req);

  const permissions = session?.user?.permissions ?? [];
  const gate = GATE.filter((g) => pathname.startsWith(g.prefix)).sort(
    (a, b) => b.prefix.length - a.prefix.length,
  )[0];

  if (gate && !permissions.includes(gate.perm)) {
    const url = new URL("/no-access", req.nextUrl.origin);
    url.searchParams.set("feature", gate.perm);
    return NextResponse.redirect(url);
  }

  return withPathname(req);
});

export const config = {
  // Skip static assets and image optimisation — without this the proxy would
  // run on every CSS and font request too.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?)$).*)"],
};
