import "server-only";
import type { Prisma } from "@prisma/client";
import { DataError, db, invalid, money2, notFound, num, numOrNull } from "./db";
import { money } from "./business";
import { nextInvoiceNumber } from "./settings";
import type { SegmentKey } from "./segments";
import {
  computeTotals as calcTotals,
  type BillLineInput as LineInput,
  type InvoiceStatus as Status,
  type InvoiceTotals as Totals,
  type PaymentMethod as Method,
} from "./billing-shared";

/**
 * Invoicing and the till.
 *
 * An invoice is the unit of everything financial here. Its lines snapshot
 * title, SKU and unit price rather than joining to the product, so a bill
 * printed today still prints identically after the product is renamed,
 * repriced or deleted.
 */

export type {
  InvoiceStatus,
  PaymentMethod,
  BillLineInput,
  InvoiceTotals,
} from "./billing-shared";
export { PAYMENT_METHODS, computeTotals } from "./billing-shared";

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

const invoiceInclude = {
  lines: { orderBy: { position: "asc" as const } },
  payments: { where: { revoked: false } },
  customer: { select: { id: true, name: true, company: true, phone: true, email: true } },
} satisfies Prisma.InvoiceInclude;

type InvoiceRow = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

export type InvoiceLineRecord = {
  id: string;
  productId: string | null;
  title: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type InvoiceRecord = {
  id: string;
  number: string;
  status: Status;
  segment: string;
  customer: {
    id: string;
    name: string;
    company: string;
    phone: string;
    email: string;
  } | null;
  walkInName: string;
  walkInPhone: string;
  staffName: string;
  staffEmail: string;
  taxable: boolean;
  taxRate: number;
  notes: string;
  lines: InvoiceLineRecord[];
  payments: {
    id: string;
    amount: number;
    method: string;
    note: string;
    takenAt: string;
  }[];
  totals: Totals;
  issuedAt: string;
  paidAt: string | null;
};

export function toInvoiceRecord(row: InvoiceRow): InvoiceRecord {
  const lines = row.lines.map((l) => ({
    id: l.id,
    productId: l.productId,
    title: l.title,
    sku: l.sku,
    quantity: l.quantity,
    unitPrice: num(l.unitPrice),
    lineTotal: money2(l.quantity * num(l.unitPrice)),
  }));

  const paid = row.payments.reduce((s, p) => s + num(p.amount), 0);

  return {
    id: row.id,
    number: row.number,
    status: row.status as Status,
    segment: row.segment,
    customer: row.customer,
    walkInName: row.walkInName,
    walkInPhone: row.walkInPhone,
    staffName: row.staffName,
    staffEmail: row.staffEmail,
    taxable: row.taxable,
    taxRate: num(row.taxRate),
    notes: row.notes,
    lines,
    payments: row.payments.map((p) => ({
      id: p.id,
      amount: num(p.amount),
      method: p.method,
      note: p.note,
      takenAt: p.takenAt.toISOString(),
    })),
    totals: calcTotals({
      lines,
      discount: num(row.discount),
      // A voided invoice owes nothing, whatever its lines say.
      taxable: row.status === "VOID" ? false : row.taxable,
      taxRate: num(row.taxRate),
      paid,
    }),
    issuedAt: row.issuedAt.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
  };
}

export async function getInvoice(id: string): Promise<InvoiceRecord | null> {
  const row = await db.invoice.findUnique({ where: { id }, include: invoiceInclude });
  return row ? toInvoiceRecord(row) : null;
}

/* -------------------------------------------------------------------------- */
/* Creating a bill                                                            */
/* -------------------------------------------------------------------------- */

export type CreateBillArgs = {
  lines: LineInput[];
  customerId?: string | null;
  walkInName?: string;
  walkInPhone?: string;
  segment?: SegmentKey;
  taxable?: boolean;
  taxRate: number;
  discount?: number;
  notes?: string;
  staffEmail: string;
  staffName: string;
  /** Take payment immediately — the normal counter sale. */
  payment?: { amount: number; method: Method; note?: string } | null;
  /**
   * Skip the credit-limit guard. The till sets this after a staff member has
   * consciously chosen to bill a customer past their limit; the storefront
   * sets it for cash/bank collection orders that are paid before release.
   */
  overrideCreditLimit?: boolean;
};

/**
 * A customer's current debt and their limit, computed the same way as the
 * customers screen: opening balance + unvoided invoice totals − live payments.
 * Kept local to avoid a cycle with lib/customers, which imports from here.
 */
async function creditPosition(
  customerId: string,
): Promise<{ creditLimit: number | null; outstanding: number } | null> {
  const row = await db.customer.findUnique({
    where: { id: customerId },
    include: {
      invoices: { where: { status: { not: "VOID" } }, include: { lines: true } },
      payments: { where: { revoked: false }, select: { amount: true } },
    },
  });
  if (!row) return null;

  const billed = row.invoices.reduce(
    (s, inv) =>
      s +
      calcTotals({
        lines: inv.lines.map((l) => ({ quantity: l.quantity, unitPrice: num(l.unitPrice) })),
        discount: num(inv.discount),
        taxable: inv.taxable,
        taxRate: num(inv.taxRate),
        paid: 0,
      }).total,
    0,
  );
  const paid = row.payments.reduce((s, p) => s + num(p.amount), 0);
  return {
    creditLimit: numOrNull(row.creditLimit),
    outstanding: money2(num(row.openingBalance) + billed - paid),
  };
}

/**
 * Throw when a new bill would push a customer past their credit limit. Only the
 * unpaid part of the bill counts — money taken now never adds to the debt. A
 * blank limit means no limit. Callers pass overrideCreditLimit to bypass this.
 */
async function assertWithinCreditLimit(args: CreateBillArgs): Promise<void> {
  if (!args.customerId || args.overrideCreditLimit) return;
  const credit = await creditPosition(args.customerId);
  if (!credit || credit.creditLimit === null) return;

  const totals = calcTotals({
    lines: args.lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice })),
    discount: args.discount ?? 0,
    taxable: args.taxable ?? true,
    taxRate: args.taxRate,
    paid: 0,
  });
  const payAmount = args.payment?.amount ?? 0;
  const adding = Math.max(0, money2(totals.total - Math.min(payAmount, totals.total)));
  const projected = money2(credit.outstanding + adding);

  // Small epsilon so a bill landing exactly on the limit is allowed.
  if (projected > credit.creditLimit + 0.005) {
    throw new DataError(
      `This takes the account to ${money(projected)}, over its ${money(
        credit.creditLimit,
      )} credit limit. Reduce the order, take a payment, or confirm to override.`,
      { status: 409, code: "conflict" },
    );
  }
}

function validateLines(lines: LineInput[]): void {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw invalid("Add at least one item before taking payment.");
  }
  for (const l of lines) {
    if (!l.title?.trim()) {
      throw invalid("Every line needs a description.");
    }
    if (!Number.isFinite(l.quantity) || l.quantity <= 0) {
      throw invalid(`Enter a quantity of 1 or more for "${l.title}".`);
    }
    if (!Number.isFinite(l.unitPrice) || l.unitPrice < 0) {
      throw invalid(`Enter a valid price for "${l.title}".`);
    }
  }
}

/**
 * Create an invoice, decrement stock and optionally record a payment — all in
 * one transaction.
 *
 * Stock moves exactly once, here. Nothing else in the app decrements it on
 * sale, so a retry that fails partway leaves neither a half-written bill nor
 * phantom stock movement.
 */
export async function createBill(args: CreateBillArgs): Promise<InvoiceRecord> {
  validateLines(args.lines);
  await assertWithinCreditLimit(args);

  // Allocate the number outside the transaction: it has its own atomic
  // counter, and holding a row lock across the whole sale would serialise
  // every till in the shop.
  const number = await nextInvoiceNumber();

  const created = await db.$transaction(async (tx) => {
    const invoice = await tx.invoice.create({
      data: {
        number,
        customerId: args.customerId || null,
        walkInName: args.customerId ? "" : (args.walkInName ?? "").trim(),
        walkInPhone: args.customerId ? "" : (args.walkInPhone ?? "").trim(),
        segment: args.segment ?? "shop",
        staffEmail: args.staffEmail,
        staffName: args.staffName,
        status: "UNPAID",
        taxable: args.taxable ?? true,
        taxRate: args.taxRate,
        discount: money2(args.discount ?? 0),
        notes: args.notes ?? "",
        lines: {
          create: args.lines.map((l, i) => ({
            productId: l.productId || null,
            title: l.title.trim(),
            sku: l.sku ?? "",
            quantity: Math.round(l.quantity),
            unitPrice: money2(l.unitPrice),
            position: i,
          })),
        },
      },
      include: invoiceInclude,
    });

    // Decrement stock for catalog lines. Custom lines have no product and move
    // no stock, which is the point of them.
    for (const line of args.lines) {
      if (!line.productId) continue;
      await tx.product.update({
        where: { id: line.productId },
        data: { stock: { decrement: Math.round(line.quantity) } },
      });
    }

    if (args.payment && args.payment.amount > 0) {
      await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          customerId: args.customerId || null,
          amount: money2(args.payment.amount),
          method: args.payment.method,
          note: args.payment.note ?? "",
          staffEmail: args.staffEmail,
        },
      });
    }

    return invoice.id;
  });

  const invoice = await getInvoice(created);
  if (!invoice) throw notFound("invoice");

  // Mark paid when the payment cleared the balance.
  if (invoice.totals.balance <= 0 && invoice.status !== "PAID") {
    await db.invoice.update({
      where: { id: invoice.id },
      data: { status: "PAID", paidAt: new Date() },
    });
    return (await getInvoice(invoice.id))!;
  }

  return invoice;
}

/* -------------------------------------------------------------------------- */
/* Editing                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Replace the contents of an unpaid invoice.
 *
 * The invoice NUMBER never changes — it has been quoted to the customer and
 * may already be on a printed copy. Stock is reconciled by difference so
 * editing a quantity does not double-count.
 */
export async function updateInvoice(
  id: string,
  patch: {
    lines?: LineInput[];
    customerId?: string | null;
    walkInName?: string;
    walkInPhone?: string;
    taxable?: boolean;
    discount?: number;
    notes?: string;
    segment?: string;
  },
): Promise<InvoiceRecord> {
  const existing = await db.invoice.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!existing) throw notFound("invoice");
  if (existing.status === "VOID") {
    throw invalid("This invoice has been voided and can no longer be edited.");
  }
  if (existing.status === "PAID" && patch.lines) {
    throw invalid(
      "This invoice is paid. Void it first if the items really need to change.",
    );
  }
  if (patch.lines) validateLines(patch.lines);

  await db.$transaction(async (tx) => {
    if (patch.lines) {
      // Net stock movement per product: old quantities go back, new ones come
      // out. Doing it as a difference means an edit from 2 to 3 moves one unit,
      // not five.
      const delta = new Map<string, number>();
      for (const l of existing.lines) {
        if (!l.productId) continue;
        delta.set(l.productId, (delta.get(l.productId) ?? 0) + l.quantity);
      }
      for (const l of patch.lines) {
        if (!l.productId) continue;
        delta.set(
          l.productId,
          (delta.get(l.productId) ?? 0) - Math.round(l.quantity),
        );
      }

      for (const [productId, change] of delta) {
        if (change === 0) continue;
        await tx.product.update({
          where: { id: productId },
          data: { stock: { increment: change } },
        });
      }

      await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
      await tx.invoiceLine.createMany({
        data: patch.lines.map((l, i) => ({
          invoiceId: id,
          productId: l.productId || null,
          title: l.title.trim(),
          sku: l.sku ?? "",
          quantity: Math.round(l.quantity),
          unitPrice: money2(l.unitPrice),
          position: i,
        })),
      });
    }

    await tx.invoice.update({
      where: { id },
      data: {
        ...(patch.customerId !== undefined
          ? {
              customerId: patch.customerId || null,
              ...(patch.customerId ? { walkInName: "", walkInPhone: "" } : {}),
            }
          : {}),
        ...(patch.walkInName !== undefined
          ? { walkInName: patch.walkInName.trim() }
          : {}),
        ...(patch.walkInPhone !== undefined
          ? { walkInPhone: patch.walkInPhone.trim() }
          : {}),
        ...(patch.taxable !== undefined ? { taxable: patch.taxable } : {}),
        ...(patch.discount !== undefined
          ? { discount: money2(patch.discount) }
          : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        ...(patch.segment !== undefined ? { segment: patch.segment } : {}),
      },
    });
  });

  return (await getInvoice(id))!;
}

/* -------------------------------------------------------------------------- */
/* Payments                                                                   */
/* -------------------------------------------------------------------------- */

export async function recordPayment(args: {
  invoiceId: string;
  amount: number;
  method: Method;
  note?: string;
  staffEmail: string;
}): Promise<InvoiceRecord> {
  if (!Number.isFinite(args.amount) || args.amount <= 0) {
    throw invalid("Enter a payment amount greater than zero.");
  }

  const invoice = await getInvoice(args.invoiceId);
  if (!invoice) throw notFound("invoice");
  if (invoice.status === "VOID") {
    throw invalid("This invoice has been voided. No payment can be taken.");
  }

  await db.payment.create({
    data: {
      invoiceId: args.invoiceId,
      customerId: invoice.customer?.id ?? null,
      amount: money2(args.amount),
      method: args.method,
      note: args.note ?? "",
      staffEmail: args.staffEmail,
    },
  });

  const updated = (await getInvoice(args.invoiceId))!;

  // Overpayment is allowed — it becomes credit on the account — but the
  // invoice itself is settled either way.
  const settled = updated.totals.balance <= 0;
  if (settled !== (updated.status === "PAID")) {
    await db.invoice.update({
      where: { id: args.invoiceId },
      data: {
        status: settled ? "PAID" : "UNPAID",
        paidAt: settled ? new Date() : null,
      },
    });
    return (await getInvoice(args.invoiceId))!;
  }

  return updated;
}

/**
 * Revoke a payment. The row is kept and flagged, never deleted — the ledger
 * has to stay auditable, and "where did that £200 go" must have an answer.
 */
export async function revokePayment(paymentId: string): Promise<void> {
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw notFound("payment");
  if (payment.revoked) return;

  await db.payment.update({
    where: { id: paymentId },
    data: { revoked: true, revokedAt: new Date() },
  });

  if (payment.invoiceId) {
    const invoice = await getInvoice(payment.invoiceId);
    if (invoice && invoice.totals.balance > 0 && invoice.status === "PAID") {
      await db.invoice.update({
        where: { id: payment.invoiceId },
        data: { status: "UNPAID", paidAt: null },
      });
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Void and duplicate                                                         */
/* -------------------------------------------------------------------------- */

/** Void an invoice and put its stock back. */
export async function voidInvoice(id: string): Promise<InvoiceRecord> {
  const existing = await db.invoice.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!existing) throw notFound("invoice");
  if (existing.status === "VOID") return (await getInvoice(id))!;

  await db.$transaction(async (tx) => {
    for (const line of existing.lines) {
      if (!line.productId) continue;
      await tx.product.update({
        where: { id: line.productId },
        data: { stock: { increment: line.quantity } },
      });
    }

    // Payments against a voided bill are revoked too, so the customer's
    // outstanding balance reflects that the sale never happened.
    await tx.payment.updateMany({
      where: { invoiceId: id, revoked: false },
      data: { revoked: true, revokedAt: new Date() },
    });

    await tx.invoice.update({
      where: { id },
      data: { status: "VOID", voidedAt: new Date(), paidAt: null },
    });
  });

  return (await getInvoice(id))!;
}

/** Copy an invoice onto a fresh number — for repeat orders. */
export async function duplicateInvoice(
  id: string,
  staff: { email: string; name: string },
): Promise<InvoiceRecord> {
  const source = await getInvoice(id);
  if (!source) throw notFound("invoice");

  return createBill({
    lines: source.lines.map((l) => ({
      productId: l.productId,
      title: l.title,
      sku: l.sku,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
    })),
    customerId: source.customer?.id ?? null,
    walkInName: source.walkInName,
    walkInPhone: source.walkInPhone,
    segment: source.segment as SegmentKey,
    taxable: source.taxable,
    taxRate: source.taxRate,
    discount: source.totals.discount,
    notes: source.notes,
    staffEmail: staff.email,
    staffName: staff.name,
  });
}

export async function deleteInvoice(id: string): Promise<void> {
  const existing = await db.invoice.findUnique({
    where: { id },
    include: { lines: true, payments: { where: { revoked: false } } },
  });
  if (!existing) throw notFound("invoice");
  if (existing.payments.length > 0) {
    throw invalid(
      "This invoice has payments against it. Void it instead so the ledger stays correct.",
    );
  }

  await db.$transaction(async (tx) => {
    for (const line of existing.lines) {
      if (!line.productId) continue;
      await tx.product.update({
        where: { id: line.productId },
        data: { stock: { increment: line.quantity } },
      });
    }
    await tx.invoice.delete({ where: { id } });
  });
}

/* -------------------------------------------------------------------------- */
/* Listing                                                                    */
/* -------------------------------------------------------------------------- */

export type InvoiceListArgs = {
  search?: string;
  status?: Status | "all" | "open";
  segment?: string;
  from?: string;
  to?: string;
  customerId?: string;
  cursor?: string | null;
  limit?: number;
};

export function buildInvoiceWhere(args: InvoiceListArgs): Prisma.InvoiceWhereInput {
  const where: Prisma.InvoiceWhereInput = {};

  if (args.status === "open") where.status = { in: ["UNPAID", "DRAFT"] };
  else if (args.status && args.status !== "all") where.status = args.status;

  if (args.segment && args.segment !== "all") where.segment = args.segment;
  if (args.customerId) where.customerId = args.customerId;

  const q = args.search?.trim();
  if (q) {
    where.OR = [
      { number: { contains: q, mode: "insensitive" } },
      { walkInName: { contains: q, mode: "insensitive" } },
      { customer: { name: { contains: q, mode: "insensitive" } } },
      { customer: { company: { contains: q, mode: "insensitive" } } },
    ];
  }

  if (args.from || args.to) {
    where.issuedAt = {
      ...(args.from ? { gte: new Date(args.from) } : {}),
      // `to` is a date, and the user means the whole of that day.
      ...(args.to ? { lte: new Date(`${args.to}T23:59:59.999`) } : {}),
    };
  }

  return where;
}

export async function listInvoices(args: InvoiceListArgs) {
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
  const where = buildInvoiceWhere(args);

  const [rows, total, summaryRows] = await Promise.all([
    db.invoice.findMany({
      where,
      include: invoiceInclude,
      orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(args.cursor ? { cursor: { id: args.cursor }, skip: 1 } : {}),
    }),
    db.invoice.count({ where }),
    // Totals across the whole filtered set (not just the page), for the header
    // stat cards. Capped so a huge book never blocks the list load.
    db.invoice.findMany({ where, include: invoiceInclude, take: 2000 }),
  ]);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const recs = summaryRows.map(toInvoiceRecord);
  const summary = {
    count: total,
    billed: money2(recs.reduce((s, r) => s + r.totals.total, 0)),
    paid: money2(recs.reduce((s, r) => s + r.totals.paid, 0)),
    outstanding: money2(recs.reduce((s, r) => s + r.totals.balance, 0)),
  };

  return {
    invoices: page.map(toInvoiceRecord),
    nextCursor: hasMore ? page[page.length - 1].id : null,
    total,
    summary,
  };
}

/** Day boundaries in server local time — the shop's day, not UTC's. */
export function dayRange(date = new Date()): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}
