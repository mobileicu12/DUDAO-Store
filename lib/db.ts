import "server-only";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * The single door to the database.
 *
 * No page, component or route handler talks to Prisma directly — they call
 * helpers in lib/, and those helpers use this client. That keeps connection
 * handling, error phrasing and money conversion in one place.
 *
 * Next's dev server reloads modules on every edit; without the global cache
 * each reload would open a new connection pool until Postgres refused them.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const connectionString = process.env.DATABASE_URL ?? "";

function create(): PrismaClient {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });
}

export const db: PrismaClient = globalForPrisma.prisma ?? create();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

/** True when there is a database to talk to at all. */
export function dbConfigured(): boolean {
  return connectionString.trim().length > 0;
}

/**
 * Error raised by the data helpers. `message` is written for shop staff — it
 * goes straight into a toast — while `detail` carries the technical text for
 * the server log.
 */
export class DataError extends Error {
  readonly status: number;
  readonly detail: string;
  readonly code: "unconfigured" | "notfound" | "conflict" | "invalid" | "upstream";

  constructor(
    message: string,
    opts: {
      status?: number;
      detail?: string;
      code?: DataError["code"];
    } = {},
  ) {
    super(message);
    this.name = "DataError";
    this.status = opts.status ?? 500;
    this.detail = opts.detail ?? message;
    this.code = opts.code ?? "upstream";
  }
}

export const notFound = (what: string): DataError =>
  new DataError(`That ${what} could not be found. It may have been deleted.`, {
    status: 404,
    code: "notfound",
  });

export const invalid = (message: string): DataError =>
  new DataError(message, { status: 400, code: "invalid" });

export function requireDb(): void {
  if (!dbConfigured()) {
    throw new DataError(
      "The database is not connected yet. Ask your developer to set DATABASE_URL, then reload.",
      { status: 503, code: "unconfigured" },
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Money                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Prisma returns Decimal columns as Decimal objects. Everything above lib/
 * works in plain numbers, so conversion happens here and only here.
 *
 * Rounds to 2dp on the way out: a Decimal that came from a division (a split
 * payment, a percentage discount) can carry more precision than a currency.
 */
export function num(
  value: { toString(): string } | number | null | undefined,
): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value.toString());
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/** Nullable variant — a null tier price must stay null, not become 0. */
export function numOrNull(
  value: { toString(): string } | number | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value.toString());
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

/** Round a number to currency precision before it goes back into the database. */
export const money2 = (n: number): number =>
  Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

/* -------------------------------------------------------------------------- */
/* Handles                                                                    */
/* -------------------------------------------------------------------------- */

/** URL-safe slug from a title, used as a product/collection handle. */
export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 80) || "item"
  );
}

/**
 * A handle that is not already taken. Handles are unique, and staff routinely
 * create two products with the same name ("Screen", "Screen") — so append a
 * counter rather than failing the save.
 */
export async function uniqueHandle(
  table: "product" | "collection",
  title: string,
  ignoreId?: string,
): Promise<string> {
  const base = slugify(title);
  let candidate = base;

  for (let i = 2; i < 200; i++) {
    const existing =
      table === "product"
        ? await db.product.findUnique({
            where: { handle: candidate },
            select: { id: true },
          })
        : await db.collection.findUnique({
            where: { handle: candidate },
            select: { id: true },
          });

    if (!existing || existing.id === ignoreId) return candidate;
    candidate = `${base}-${i}`;
  }

  // Astronomically unlikely; a timestamp suffix is still better than throwing.
  return `${base}-${Date.now()}`;
}
