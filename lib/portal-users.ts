import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import {
  ALL_PERMS,
  DEFAULT_MEMBER_PERMS,
  sanitizePerms,
  type PermKey,
  type Role,
} from "./permissions";
import { db, dbConfigured } from "./db";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

/** Stored shape. `passwordHash` is why this type never crosses to the browser. */
export type PortalUser = {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: Role;
  addedAt: string;
  passwordHash: string;
  permissions: PermKey[];
};

/** The only user shape an API route may return. */
export type PublicUser = Omit<PortalUser, "passwordHash"> & {
  hasPassword: boolean;
};

export const toPublic = (u: PortalUser): PublicUser => {
  const { passwordHash, ...rest } = u;
  return { ...rest, hasPassword: Boolean(passwordHash) };
};

export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();

/* -------------------------------------------------------------------------- */
/* Owners                                                                     */
/* -------------------------------------------------------------------------- */

export function ownerEmails(): string[] {
  return (process.env.PORTAL_OWNER_EMAIL ?? "")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean);
}

export function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ownerEmails().includes(normalizeEmail(email));
}

/* -------------------------------------------------------------------------- */
/* Password hashing                                                           */
/* -------------------------------------------------------------------------- */

const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEYLEN);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

/**
 * Constant-time password check. Returns false rather than throwing on a
 * malformed stored hash, so a corrupted record locks that account out instead
 * of 500-ing the whole login route.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  if (!stored || !password) return false;
  const [saltHex, keyHex] = stored.split(":");
  if (!saltHex || !keyHex) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltHex, "hex");
    expected = Buffer.from(keyHex, "hex");
  } catch {
    return false;
  }
  if (expected.length !== KEYLEN) return false;

  const actual = await scrypt(password, salt, KEYLEN);
  return timingSafeEqual(actual, expected);
}

/* -------------------------------------------------------------------------- */
/* Lookup                                                                     */
/* -------------------------------------------------------------------------- */

type Row = {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: string;
  passwordHash: string;
  permissions: string[];
  createdAt: Date;
};

const fromRow = (r: Row): PortalUser => ({
  id: r.id,
  email: r.email,
  name: r.name || r.email.split("@")[0],
  phone: r.phone,
  role: r.role === "owner" ? "owner" : "member",
  addedAt: r.createdAt.toISOString(),
  passwordHash: r.passwordHash,
  permissions: sanitizePerms(r.permissions),
});

/**
 * Resolve an email to its effective identity.
 *
 * Owner status is derived from PORTAL_OWNER_EMAIL, not from the database, so
 * an owner cannot be locked out by someone editing the users table, and always
 * holds every permission regardless of what is stored.
 */
export async function findUser(email: string): Promise<PortalUser | null> {
  const target = normalizeEmail(email);
  if (!target || !dbConfigured()) return null;

  const row = await db.user.findUnique({ where: { email: target } });

  if (isOwnerEmail(target)) {
    return {
      id: row?.id ?? `owner:${target}`,
      email: target,
      name: row?.name || target.split("@")[0],
      phone: row?.phone ?? "",
      role: "owner",
      addedAt: (row?.createdAt ?? new Date(0)).toISOString(),
      passwordHash: row?.passwordHash ?? "",
      permissions: [...ALL_PERMS],
    };
  }

  return row ? fromRow(row) : null;
}

/** Can this email sign in at all? Owners always can; members must be invited. */
export async function isInvited(email: string): Promise<boolean> {
  const target = normalizeEmail(email);
  if (isOwnerEmail(target)) return true;
  if (!dbConfigured()) return false;
  const row = await db.user.findUnique({
    where: { email: target },
    select: { id: true },
  });
  return Boolean(row);
}

export async function listTeam(): Promise<PublicUser[]> {
  if (!dbConfigured()) return [];

  const rows = await db.user.findMany({ orderBy: { email: "asc" } });
  const stored = rows.map(fromRow);

  // Owners are listed from the environment even if they have no stored row.
  const owners: PublicUser[] = ownerEmails().map((email) => {
    const row = stored.find((s) => s.email === email);
    return {
      id: row?.id ?? `owner:${email}`,
      email,
      name: row?.name || email.split("@")[0],
      phone: row?.phone ?? "",
      role: "owner" as Role,
      addedAt: row?.addedAt ?? new Date(0).toISOString(),
      permissions: [...ALL_PERMS],
      hasPassword: Boolean(row?.passwordHash),
    };
  });

  const members = stored
    .filter((s) => !isOwnerEmail(s.email))
    .map(toPublic);

  return [...owners, ...members];
}

/* -------------------------------------------------------------------------- */
/* Mutations                                                                  */
/* -------------------------------------------------------------------------- */

export class UserError extends Error {}

export async function upsertMember(input: {
  email: string;
  name?: string;
  phone?: string;
  password?: string;
  permissions?: PermKey[];
}): Promise<PublicUser> {
  const email = normalizeEmail(input.email);
  if (!email || !email.includes("@")) {
    throw new UserError("That does not look like an email address.");
  }
  if (isOwnerEmail(email)) {
    throw new UserError(
      "That address is an owner account and is managed in your environment settings, not here.",
    );
  }
  if (input.password !== undefined && input.password.length < 8) {
    throw new UserError("Choose a password of at least 8 characters.");
  }

  const passwordHash = input.password
    ? await hashPassword(input.password)
    : undefined;

  const row = await db.user.upsert({
    where: { email },
    create: {
      email,
      name: input.name?.trim() || email.split("@")[0],
      phone: input.phone?.trim() ?? "",
      role: "member",
      passwordHash: passwordHash ?? "",
      permissions: input.permissions
        ? sanitizePerms(input.permissions)
        : [...DEFAULT_MEMBER_PERMS],
    },
    update: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.phone !== undefined ? { phone: input.phone.trim() } : {}),
      ...(passwordHash !== undefined ? { passwordHash } : {}),
      ...(input.permissions !== undefined
        ? { permissions: sanitizePerms(input.permissions) }
        : {}),
    },
  });

  return toPublic(fromRow(row));
}

export async function removeMember(email: string): Promise<void> {
  const target = normalizeEmail(email);
  if (isOwnerEmail(target)) {
    throw new UserError("Owner accounts cannot be removed from this screen.");
  }
  await db.user.deleteMany({ where: { email: target } });
}

/** Used by the "change my password" flow and by the time clock. */
export async function setOwnPassword(
  email: string,
  password: string,
): Promise<void> {
  if (password.length < 8) {
    throw new UserError("Choose a password of at least 8 characters.");
  }
  const target = normalizeEmail(email);
  const passwordHash = await hashPassword(password);

  const existing = await db.user.findUnique({ where: { email: target } });

  if (existing) {
    await db.user.update({ where: { email: target }, data: { passwordHash } });
    return;
  }

  if (isOwnerEmail(target)) {
    // Owners have no stored row until they set a password; create one so
    // credentials sign-in works, without granting anything extra.
    await db.user.create({
      data: {
        email: target,
        name: target.split("@")[0],
        role: "owner",
        passwordHash,
        permissions: [...ALL_PERMS],
      },
    });
    return;
  }

  throw new UserError("That account does not exist.");
}

/** Verify email + password. Returns the user on success, null on any failure. */
export async function authenticate(
  email: string,
  password: string,
): Promise<PortalUser | null> {
  const user = await findUser(email);
  if (!user || !user.passwordHash) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  return ok ? user : null;
}
