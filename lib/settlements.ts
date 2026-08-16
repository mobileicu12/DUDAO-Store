import "server-only";
import type { Buying as BuyingRow } from "@prisma/client";
import { db, invalid, money2, num } from "./db";

/**
 * Buying / cost settlement — OWNER ONLY, and deliberately separate from
 * Expenses.
 *
 * Expenses = running shop costs (rent, wages, utilities) recorded for the books.
 * Buying   = money spent purchasing stock to resell. The owner logs buying costs
 *            here to see NET earnings (sales received − buying), and can flip
 *            each entry in or out of that calculation.
 */

export type Buying = {
  id: string;
  date: string; // ISO
  supplier: string;
  description: string;
  amount: number;
  included: boolean;
  createdBy: string;
  createdAt: string;
};

function toRecord(row: BuyingRow): Buying {
  return {
    id: row.id,
    date: row.date.toISOString(),
    supplier: row.supplier,
    description: row.description,
    amount: num(row.amount),
    included: row.included,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listBuying(): Promise<Buying[]> {
  const rows = await db.buying.findMany({ orderBy: { date: "desc" }, take: 500 });
  return rows.map(toRecord);
}

export async function addBuying(input: {
  date?: string;
  supplier?: string;
  description?: string;
  amount: number;
  included?: boolean;
  createdBy?: string;
}): Promise<Buying> {
  if (!(input.amount > 0)) throw invalid("A positive amount is required.");
  const row = await db.buying.create({
    data: {
      date: input.date ? new Date(input.date) : new Date(),
      supplier: (input.supplier ?? "").trim(),
      description: (input.description ?? "").trim(),
      amount: money2(input.amount),
      included: input.included !== false,
      createdBy: input.createdBy ?? "",
    },
  });
  return toRecord(row);
}

/** Flip a single entry in or out of the net-earnings calculation. */
export async function setBuyingIncluded(id: string, included: boolean): Promise<void> {
  await db.buying.update({ where: { id }, data: { included } }).catch(() => {
    throw invalid("Entry not found.");
  });
}

export async function deleteBuying(id: string): Promise<void> {
  await db.buying.delete({ where: { id } }).catch(() => {
    throw invalid("Entry not found.");
  });
}

/**
 * Sales money actually received in a window — the sum of non-revoked payments
 * against invoices issued in the window. This is the gross that buying is
 * settled against to show net earnings.
 */
export async function salesReceivedBetween(from: Date, to: Date): Promise<number> {
  const invoices = await db.invoice.findMany({
    where: { issuedAt: { gte: from, lte: to }, status: { not: "VOID" } },
    include: { payments: { where: { revoked: false }, select: { amount: true } } },
  });
  let sum = 0;
  for (const inv of invoices) {
    for (const p of inv.payments) sum += num(p.amount);
  }
  return money2(sum);
}
