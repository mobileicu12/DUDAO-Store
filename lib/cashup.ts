import "server-only";
import { Prisma } from "@prisma/client";
import { db, money2, num } from "./db";
import { dayRange } from "./billing";
import type { PaymentMethod } from "./billing-shared";

/**
 * End-of-day cash-up.
 *
 * The till knows what should be in the drawer: the sum of today's cash
 * payments, plus whatever float was left in at open. Staff count the physical
 * cash and record it; the variance (counted − float − expected) is what makes a
 * recurring till discrepancy visible before it becomes a real loss.
 */

export type MethodBreakdown = Record<PaymentMethod, number> & { total: number };

export type Settlement = {
  businessDay: string;
  byMethod: MethodBreakdown;
  /** Cash the till expects in the drawer today (excludes the float). */
  expectedCash: number;
  paymentCount: number;
};

const emptyBreakdown = (): MethodBreakdown => ({
  cash: 0,
  card: 0,
  bank: 0,
  account: 0,
  total: 0,
});

const businessDay = (d = new Date()): string => d.toISOString().slice(0, 10);

/** Today's takings split by how the money came in — the settlement figures. */
export async function todaysSettlement(): Promise<Settlement> {
  const { start, end } = dayRange();
  const [rows, count] = await Promise.all([
    db.payment.groupBy({
      by: ["method"],
      where: { takenAt: { gte: start, lte: end }, revoked: false },
      _sum: { amount: true },
    }),
    db.payment.count({
      where: { takenAt: { gte: start, lte: end }, revoked: false },
    }),
  ]);

  const byMethod = emptyBreakdown();
  for (const r of rows) {
    const amount = money2(num(r._sum.amount ?? 0));
    if (r.method in byMethod) byMethod[r.method as PaymentMethod] = amount;
    byMethod.total = money2(byMethod.total + amount);
  }

  return {
    businessDay: businessDay(),
    byMethod,
    expectedCash: byMethod.cash,
    paymentCount: count,
  };
}

export type CashUpRecord = {
  id: string;
  businessDay: string;
  createdAt: string;
  who: string;
  float: number;
  expectedCash: number;
  countedCash: number;
  variance: number;
  byMethod: MethodBreakdown;
  note: string;
};

export async function recordCashUp(args: {
  countedCash: number;
  float: number;
  note?: string;
  who: string;
}): Promise<CashUpRecord> {
  const settlement = await todaysSettlement();
  const float = money2(Math.max(0, args.float || 0));
  const countedCash = money2(Math.max(0, args.countedCash || 0));
  const expectedCash = settlement.expectedCash;
  // What should be in the drawer is the float plus the cash taken; anything
  // else is the variance.
  const variance = money2(countedCash - float - expectedCash);

  const row = await db.cashUp.create({
    data: {
      businessDay: settlement.businessDay,
      who: args.who,
      float,
      expectedCash,
      countedCash,
      variance,
      byMethod: settlement.byMethod as unknown as Prisma.InputJsonValue,
      note: (args.note ?? "").slice(0, 300),
    },
  });

  return toRecord(row);
}

export async function listCashUps(limit = 30): Promise<CashUpRecord[]> {
  const rows = await db.cashUp.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
  });
  return rows.map(toRecord);
}

function toRecord(row: {
  id: string;
  businessDay: string;
  createdAt: Date;
  who: string;
  float: Prisma.Decimal;
  expectedCash: Prisma.Decimal;
  countedCash: Prisma.Decimal;
  variance: Prisma.Decimal;
  byMethod: Prisma.JsonValue;
  note: string;
}): CashUpRecord {
  const bm = (row.byMethod ?? {}) as Partial<MethodBreakdown>;
  return {
    id: row.id,
    businessDay: row.businessDay,
    createdAt: row.createdAt.toISOString(),
    who: row.who,
    float: num(row.float),
    expectedCash: num(row.expectedCash),
    countedCash: num(row.countedCash),
    variance: num(row.variance),
    byMethod: {
      cash: bm.cash ?? 0,
      card: bm.card ?? 0,
      bank: bm.bank ?? 0,
      account: bm.account ?? 0,
      total: bm.total ?? 0,
    },
    note: row.note,
  };
}
