import "server-only";
import type { Prisma } from "@prisma/client";
import { db, invalid, money2, notFound, num, numOrNull } from "./db";
import { computeTotals, type PaymentMethod } from "./billing";
import { withSegments, type SegmentKey } from "./segments";
import { randomBytes } from "node:crypto";

/**
 * Customers and the payment ledger.
 *
 * The ledger is the heart of this screen. A trade counter runs on credit: what
 * matters is not what a customer bought but what they still owe, and the one
 * number staff will argue with you about is `outstanding`. It is defined in
 * exactly one place — customerBalance() — so the list and the detail page can
 * never disagree.
 */

export type CustomerSummary = {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  segments: SegmentKey[];
  openingBalance: number;
  creditLimit: number | null;
  invoiceCount: number;
  totalBilled: number;
  totalPaid: number;
  outstanding: number;
  createdAt: string;
};

export type CustomerDetail = CustomerSummary & {
  address: string;
  city: string;
  postcode: string;
  country: string;
  notes: string;
  tradeCode: string | null;
  invoices: {
    id: string;
    number: string;
    status: string;
    issuedAt: string;
    total: number;
    paid: number;
    balance: number;
  }[];
  ledger: {
    id: string;
    amount: number;
    method: string;
    note: string;
    takenAt: string;
    invoiceNumber: string | null;
    revoked: boolean;
  }[];
};

/**
 * The balance definition.
 *
 *   outstanding = opening balance + everything invoiced − everything paid
 *
 * Voided invoices are excluded (the sale did not happen) and revoked payments
 * are excluded (the money did not arrive). Both exclusions matter: without
 * them a voided bill would haunt a customer's account forever.
 */
function customerBalance(args: {
  openingBalance: number;
  invoices: { total: number }[];
  payments: { amount: number }[];
}): { totalBilled: number; totalPaid: number; outstanding: number } {
  const totalBilled = money2(
    args.invoices.reduce((s, i) => s + i.total, 0),
  );
  const totalPaid = money2(args.payments.reduce((s, p) => s + p.amount, 0));
  return {
    totalBilled,
    totalPaid,
    outstanding: money2(args.openingBalance + totalBilled - totalPaid),
  };
}

const summaryInclude = {
  invoices: {
    where: { status: { not: "VOID" } },
    include: { lines: true, payments: { where: { revoked: false } } },
  },
  payments: { where: { revoked: false } },
} satisfies Prisma.CustomerInclude;

type CustomerRow = Prisma.CustomerGetPayload<{ include: typeof summaryInclude }>;

function invoiceTotal(inv: CustomerRow["invoices"][number]): number {
  return computeTotals({
    lines: inv.lines.map((l) => ({
      quantity: l.quantity,
      unitPrice: num(l.unitPrice),
    })),
    discount: num(inv.discount),
    taxable: inv.taxable,
    taxRate: num(inv.taxRate),
    paid: 0,
  }).total;
}

function toSummary(row: CustomerRow): CustomerSummary {
  const invoices = row.invoices.map((i) => ({ total: invoiceTotal(i) }));
  const payments = row.payments.map((p) => ({ amount: num(p.amount) }));
  const openingBalance = num(row.openingBalance);

  return {
    id: row.id,
    name: row.name,
    company: row.company,
    email: row.email,
    phone: row.phone,
    segments: row.segments as SegmentKey[],
    openingBalance,
    creditLimit: numOrNull(row.creditLimit),
    invoiceCount: row.invoices.length,
    createdAt: row.createdAt.toISOString(),
    ...customerBalance({ openingBalance, invoices, payments }),
  };
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

export async function listCustomers(args: {
  search?: string;
  segment?: string;
  cursor?: string | null;
  limit?: number;
}) {
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
  const where: Prisma.CustomerWhereInput = {};

  const q = args.search?.trim();
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { company: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ];
  }
  if (args.segment && args.segment !== "all") {
    where.segments = { has: args.segment };
  }

  const [rows, total] = await Promise.all([
    db.customer.findMany({
      where,
      include: summaryInclude,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: limit + 1,
      ...(args.cursor ? { cursor: { id: args.cursor }, skip: 1 } : {}),
    }),
    db.customer.count({ where }),
  ]);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    customers: page.map(toSummary),
    nextCursor: hasMore ? page[page.length - 1].id : null,
    total,
  };
}

/** Typeahead for the till's customer picker. */
export async function searchCustomers(q: string, limit = 15) {
  const term = q.trim();
  if (!term) return [];

  const rows = await db.customer.findMany({
    where: {
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        { company: { contains: term, mode: "insensitive" } },
        { phone: { contains: term, mode: "insensitive" } },
        { email: { contains: term, mode: "insensitive" } },
      ],
    },
    include: summaryInclude,
    orderBy: { name: "asc" },
    take: Math.min(limit, 40),
  });

  return rows.map(toSummary);
}

export async function getCustomer(id: string): Promise<CustomerDetail | null> {
  const row = await db.customer.findUnique({
    where: { id },
    include: {
      invoices: {
        include: { lines: true, payments: { where: { revoked: false } } },
        orderBy: { issuedAt: "desc" },
      },
      // The ledger shows revoked entries too, greyed out — hiding them makes a
      // corrected mistake look like missing money.
      payments: {
        include: { invoice: { select: { number: true } } },
        orderBy: { takenAt: "desc" },
      },
    },
  });
  if (!row) return null;

  const liveInvoices = row.invoices.filter((i) => i.status !== "VOID");
  const livePayments = row.payments.filter((p) => !p.revoked);
  const openingBalance = num(row.openingBalance);

  const balances = customerBalance({
    openingBalance,
    invoices: liveInvoices.map((i) => ({ total: invoiceTotal(i) })),
    payments: livePayments.map((p) => ({ amount: num(p.amount) })),
  });

  return {
    id: row.id,
    name: row.name,
    company: row.company,
    email: row.email,
    phone: row.phone,
    segments: row.segments as SegmentKey[],
    openingBalance,
    creditLimit: numOrNull(row.creditLimit),
    invoiceCount: liveInvoices.length,
    createdAt: row.createdAt.toISOString(),
    ...balances,
    address: row.address,
    city: row.city,
    postcode: row.postcode,
    country: row.country,
    notes: row.notes,
    tradeCode: row.tradeCode,
    invoices: row.invoices.map((i) => {
      const total = i.status === "VOID" ? 0 : invoiceTotal(i);
      const paid = money2(
        i.payments.reduce((s, p) => s + num(p.amount), 0),
      );
      return {
        id: i.id,
        number: i.number,
        status: i.status,
        issuedAt: i.issuedAt.toISOString(),
        total,
        paid,
        balance: money2(total - paid),
      };
    }),
    ledger: row.payments.map((p) => ({
      id: p.id,
      amount: num(p.amount),
      method: p.method,
      note: p.note,
      takenAt: p.takenAt.toISOString(),
      invoiceNumber: p.invoice?.number ?? null,
      revoked: p.revoked,
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

export type CustomerInput = {
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  postcode?: string;
  country?: string;
  segments?: SegmentKey[];
  openingBalance?: number;
  creditLimit?: number | null;
  notes?: string;
};

export async function createCustomer(
  input: CustomerInput,
): Promise<CustomerSummary> {
  if (!input.name?.trim()) {
    throw invalid("Give the customer a name before saving.");
  }

  const row = await db.customer.create({
    data: {
      name: input.name.trim(),
      company: input.company?.trim() ?? "",
      email: input.email?.trim() ?? "",
      phone: input.phone?.trim() ?? "",
      address: input.address ?? "",
      city: input.city ?? "",
      postcode: input.postcode ?? "",
      country: input.country || "United Kingdom",
      segments: withSegments([], input.segments ?? []).map((t) => t.slice(4)),
      openingBalance: money2(input.openingBalance ?? 0),
      creditLimit: input.creditLimit ?? null,
      notes: input.notes ?? "",
    },
    include: summaryInclude,
  });

  return toSummary(row);
}

export async function updateCustomer(
  id: string,
  input: Partial<CustomerInput>,
): Promise<CustomerSummary> {
  const existing = await db.customer.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw notFound("customer");

  const row = await db.customer.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.company !== undefined ? { company: input.company.trim() } : {}),
      ...(input.email !== undefined ? { email: input.email.trim() } : {}),
      ...(input.phone !== undefined ? { phone: input.phone.trim() } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.postcode !== undefined ? { postcode: input.postcode } : {}),
      ...(input.country !== undefined ? { country: input.country } : {}),
      ...(input.segments !== undefined ? { segments: input.segments } : {}),
      ...(input.openingBalance !== undefined
        ? { openingBalance: money2(input.openingBalance) }
        : {}),
      ...(input.creditLimit !== undefined
        ? { creditLimit: input.creditLimit }
        : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
    include: summaryInclude,
  });

  return toSummary(row);
}

export async function deleteCustomer(id: string): Promise<void> {
  const invoices = await db.invoice.count({ where: { customerId: id } });
  if (invoices > 0) {
    throw invalid(
      "This customer has invoices against them and cannot be deleted. Their history has to stay.",
    );
  }
  await db.customer.delete({ where: { id } });
}

/**
 * Delete several customers at once, applying the same rule as a single delete:
 * anyone with invoice history is kept, never silently wiped. Returns how many
 * went and how many were spared so the caller can tell the user.
 */
export async function bulkDeleteCustomers(
  ids: string[],
): Promise<{ deleted: number; skipped: number }> {
  const clean = [...new Set(ids.filter(Boolean))];
  if (clean.length === 0) return { deleted: 0, skipped: 0 };

  const withHistory = await db.invoice.findMany({
    where: { customerId: { in: clean } },
    select: { customerId: true },
    distinct: ["customerId"],
  });
  const blocked = new Set(
    withHistory.map((r) => r.customerId).filter(Boolean) as string[],
  );
  const deletable = clean.filter((id) => !blocked.has(id));

  if (deletable.length) {
    await db.customer.deleteMany({ where: { id: { in: deletable } } });
  }
  return { deleted: deletable.length, skipped: clean.length - deletable.length };
}

/** Add or remove a set of segments across many customers in one go. */
export async function bulkCustomerSegments(
  ids: string[],
  segments: SegmentKey[],
  mode: "add" | "remove",
): Promise<{ updated: number }> {
  const clean = [...new Set(ids.filter(Boolean))];
  if (clean.length === 0 || segments.length === 0) return { updated: 0 };

  const rows = await db.customer.findMany({
    where: { id: { in: clean } },
    select: { id: true, segments: true },
  });

  await db.$transaction(
    rows.map((r) => {
      const next = new Set(r.segments as SegmentKey[]);
      if (mode === "add") segments.forEach((s) => next.add(s));
      else segments.forEach((s) => next.delete(s));
      return db.customer.update({
        where: { id: r.id },
        data: { segments: [...next] },
      });
    }),
  );
  return { updated: rows.length };
}

/**
 * Record a payment against the account rather than a specific invoice — the
 * "he dropped £200 off the balance" case. It reduces what they owe overall
 * without being tied to a bill.
 */
export async function recordAccountPayment(args: {
  customerId: string;
  amount: number;
  method: PaymentMethod;
  note?: string;
  staffEmail: string;
}): Promise<void> {
  if (!Number.isFinite(args.amount) || args.amount <= 0) {
    throw invalid("Enter a payment amount greater than zero.");
  }
  const customer = await db.customer.findUnique({
    where: { id: args.customerId },
    select: { id: true },
  });
  if (!customer) throw notFound("customer");

  await db.payment.create({
    data: {
      customerId: args.customerId,
      amount: money2(args.amount),
      method: args.method,
      note: args.note ?? "",
      staffEmail: args.staffEmail,
    },
  });
}

/**
 * Issue a trade access code. Kept even though there is no storefront yet, so
 * trade pricing can be switched on later without a migration or a scramble to
 * generate codes for an existing book of customers.
 */
export async function generateTradeCode(id: string): Promise<string> {
  // Ambiguous characters removed — this gets read down the phone.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  const code = Array.from(bytes)
    .map((b) => alphabet[b % alphabet.length])
    .join("");

  await db.customer.update({ where: { id }, data: { tradeCode: code } });
  return code;
}

/** Everyone billed today, with their bills — powers the day-report drawer. */
export async function customersBilledToday(range: { start: Date; end: Date }) {
  const invoices = await db.invoice.findMany({
    where: {
      issuedAt: { gte: range.start, lte: range.end },
      status: { not: "VOID" },
    },
    include: {
      lines: true,
      payments: { where: { revoked: false } },
      customer: { select: { id: true, name: true, company: true, email: true, phone: true } },
    },
    orderBy: { issuedAt: "asc" },
  });

  // Group STRICTLY by account. One customer's bills must never appear in
  // another's message — walk-ins have no account and are grouped separately
  // under a null key for the owner's report only.
  const groups = new Map<
    string,
    {
      customer: { id: string; name: string; company: string; email: string; phone: string } | null;
      invoices: typeof invoices;
    }
  >();

  for (const inv of invoices) {
    const key = inv.customerId ?? "__walkin__";
    if (!groups.has(key)) {
      groups.set(key, { customer: inv.customer, invoices: [] });
    }
    groups.get(key)!.invoices.push(inv);
  }

  return Array.from(groups.entries()).map(([key, group]) => {
    const totals = group.invoices.map((i) => ({
      total: computeTotals({
        lines: i.lines.map((l) => ({
          quantity: l.quantity,
          unitPrice: num(l.unitPrice),
        })),
        discount: num(i.discount),
        taxable: i.taxable,
        taxRate: num(i.taxRate),
        paid: 0,
      }).total,
      paid: money2(i.payments.reduce((s, p) => s + num(p.amount), 0)),
    }));

    return {
      key,
      customer: group.customer,
      invoices: group.invoices.map((i, idx) => ({
        id: i.id,
        number: i.number,
        issuedAt: i.issuedAt.toISOString(),
        total: totals[idx].total,
        paid: totals[idx].paid,
        lines: i.lines.map((l) => ({
          title: l.title,
          sku: l.sku,
          quantity: l.quantity,
          unitPrice: num(l.unitPrice),
        })),
      })),
      dayTotal: money2(totals.reduce((s, t) => s + t.total, 0)),
      dayPaid: money2(totals.reduce((s, t) => s + t.paid, 0)),
    };
  });
}
