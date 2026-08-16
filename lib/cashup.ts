import "server-only";
import { Prisma } from "@prisma/client";
import { db, money2, num } from "./db";
import { dayRange } from "./billing";
import { expensesBetween } from "./expenses";
import type { PaymentMethod } from "./billing-shared";

/**
 * End-of-day cash-up.
 *
 * The till knows what should be in the drawer: opening float, plus the cash
 * taken today, minus any cash paid out as expenses. Staff count the physical
 * cash (and optionally the card terminal) and record it; the variances are what
 * make a recurring discrepancy visible before it becomes a real loss.
 *
 * DUDAO holds real payment rows with a method and a customer, so the "system"
 * side is computed exactly — no re-typing, the count is purely a check.
 */

export type MethodBreakdown = Record<PaymentMethod, number> & { total: number };

/** One person's contribution to the day, per method — "Ravi paid cash 100". */
export type CashUpLine = { name: string; method: string; amount: number };

export type Settlement = {
  businessDay: string;
  byMethod: MethodBreakdown;
  /** Cash the till expects in the drawer before the float (cash − cash expenses). */
  expectedCash: number;
  /** Card takings expected on the terminal. */
  expectedCard: number;
  /** Cash paid out as expenses today — comes out of the drawer. */
  cashExpenses: number;
  paymentCount: number;
  /** Money received against a registered customer's account, per person. */
  accountLines: CashUpLine[];
  /** Walk-in / counter takings split by method. */
  counterByMethod: MethodBreakdown;
};

const emptyBreakdown = (): MethodBreakdown => ({
  cash: 0,
  card: 0,
  bank: 0,
  account: 0,
  total: 0,
});

const businessDay = (d = new Date()): string => d.toISOString().slice(0, 10);

const isMethod = (m: string): m is PaymentMethod =>
  m === "cash" || m === "card" || m === "bank" || m === "account";

/** Today's takings split by how the money came in — the settlement figures. */
export async function todaysSettlement(): Promise<Settlement> {
  const { start, end } = dayRange();

  const [payments, expenses] = await Promise.all([
    db.payment.findMany({
      where: { takenAt: { gte: start, lte: end }, revoked: false },
      select: {
        amount: true,
        method: true,
        customer: { select: { name: true } },
        invoice: { select: { customer: { select: { name: true } } } },
      },
    }),
    expensesBetween(start, end),
  ]);

  const byMethod = emptyBreakdown();
  const counterByMethod = emptyBreakdown();
  const perCustomer = new Map<string, number>();

  for (const p of payments) {
    const amount = num(p.amount);
    const method = isMethod(p.method) ? p.method : "cash";
    byMethod[method] = money2(byMethod[method] + amount);
    byMethod.total = money2(byMethod.total + amount);

    const name = p.customer?.name ?? p.invoice?.customer?.name ?? "";
    if (name) {
      const key = `${name}||${method}`;
      perCustomer.set(key, (perCustomer.get(key) ?? 0) + amount);
    } else {
      counterByMethod[method] = money2(counterByMethod[method] + amount);
      counterByMethod.total = money2(counterByMethod.total + amount);
    }
  }

  const cashExpenses = money2(
    expenses.filter((e) => e.method === "cash").reduce((s, e) => s + e.amount, 0),
  );

  const accountLines: CashUpLine[] = [...perCustomer.entries()]
    .map(([key, amount]) => {
      const [name, method] = key.split("||");
      return { name, method, amount: money2(amount) };
    })
    .sort((a, b) => b.amount - a.amount);

  return {
    businessDay: businessDay(),
    byMethod,
    expectedCash: money2(byMethod.cash - cashExpenses),
    expectedCard: byMethod.card,
    cashExpenses,
    paymentCount: payments.length,
    accountLines,
    counterByMethod,
  };
}

export type CashUpRecord = {
  id: string;
  businessDay: string;
  createdAt: string;
  who: string;
  float: number;
  expectedCash: number;
  cashExpenses: number;
  countedCash: number;
  variance: number;
  countedCard: number;
  cardVariance: number;
  byMethod: MethodBreakdown;
  note: string;
};

export async function recordCashUp(args: {
  countedCash: number;
  countedCard?: number;
  float: number;
  note?: string;
  who: string;
}): Promise<CashUpRecord> {
  const settlement = await todaysSettlement();
  const float = money2(Math.max(0, args.float || 0));
  const countedCash = money2(Math.max(0, args.countedCash || 0));
  const countedCard = money2(Math.max(0, args.countedCard || 0));
  // Expected cash already nets off cash expenses; the drawer also holds the float.
  const variance = money2(countedCash - float - settlement.expectedCash);
  const cardVariance = money2(countedCard - settlement.expectedCard);

  const row = await db.cashUp.create({
    data: {
      businessDay: settlement.businessDay,
      who: args.who,
      float,
      expectedCash: settlement.expectedCash,
      cashExpenses: settlement.cashExpenses,
      countedCash,
      variance,
      countedCard,
      cardVariance,
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
  cashExpenses: Prisma.Decimal;
  countedCash: Prisma.Decimal;
  variance: Prisma.Decimal;
  countedCard: Prisma.Decimal;
  cardVariance: Prisma.Decimal;
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
    cashExpenses: num(row.cashExpenses),
    countedCash: num(row.countedCash),
    variance: num(row.variance),
    countedCard: num(row.countedCard),
    cardVariance: num(row.cardVariance),
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
