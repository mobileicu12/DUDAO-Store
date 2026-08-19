import "server-only";
import { Prisma } from "@prisma/client";
import { db, money2, num } from "./db";
import { expensesBetween } from "./expenses";
import {
  zeroSplit,
  bucket,
  round2,
  type MethodSplit,
  type CashUp,
  type CashUpLine,
  type DayTakings,
} from "./cashup-types";

export * from "./cashup-types";

/**
 * Daily cash-up — what the system says was taken, against what staff counted.
 *
 * The system side (takingsFor) is computed exactly from DUDAO's payment rows,
 * so the hand count becomes a check rather than a re-typing exercise. Mirrors
 * MOBILE ICU's cash-up two ways: by source (accounts + counter + credit) and by
 * method (cash/card), which must land on the same number.
 */

function dayBounds(date: string): { from: Date; to: Date } {
  const from = new Date(`${date}T00:00:00`);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from, to };
}

/** Everything the portal knows about a given day's money. */
export async function takingsFor(date: string): Promise<DayTakings> {
  const { from, to } = dayBounds(date);

  const [payments, expenses] = await Promise.all([
    db.payment.findMany({
      where: { takenAt: { gte: from, lt: to }, revoked: false },
      select: {
        amount: true,
        method: true,
        invoiceId: true,
        customer: { select: { name: true } },
        invoice: { select: { customer: { select: { name: true } } } },
      },
    }),
    expensesBetween(from, to).catch(() => []),
  ]);

  const receivedByMethod = zeroSplit();
  const counterByMethod = zeroSplit();
  let fromAccounts = 0;
  let fromCounter = 0;
  let onAccountCredit = 0;
  const perAccount = new Map<string, number>();
  const perCredit = new Map<string, number>();

  for (const p of payments) {
    const amt = num(p.amount);
    const m = bucket(p.method);
    receivedByMethod[m] = round2(receivedByMethod[m] + amt);
    const name = p.customer?.name ?? p.invoice?.customer?.name ?? "";

    if (name && p.invoiceId) {
      fromAccounts += amt;
      const key = `${name}||${m}`;
      perAccount.set(key, (perAccount.get(key) ?? 0) + amt);
    } else if (name) {
      // Paid onto the account with no bill against it — a credit.
      onAccountCredit += amt;
      const key = `${name}||${m}`;
      perCredit.set(key, (perCredit.get(key) ?? 0) + amt);
    } else {
      fromCounter += amt;
      counterByMethod[m] = round2(counterByMethod[m] + amt);
    }
  }

  const toLines = (map: Map<string, number>): CashUpLine[] =>
    [...map.entries()]
      .map(([key, amount]) => {
        const [name, method] = key.split("||");
        return { name, method, amount: round2(amount) };
      })
      .sort((a, b) => b.amount - a.amount);

  const expensesByMethod = zeroSplit();
  const expenseLines: CashUpLine[] = [];
  for (const x of expenses) {
    expensesByMethod[bucket(x.method)] += x.amount;
    expenseLines.push({
      name: x.description || x.category || "Expense",
      amount: round2(x.amount),
      method: bucket(x.method),
    });
  }
  for (const k of Object.keys(expensesByMethod) as (keyof MethodSplit)[]) {
    expensesByMethod[k] = round2(expensesByMethod[k]);
  }

  const receivedTotal = round2(
    Object.values(receivedByMethod).reduce((a, b) => a + b, 0),
  );
  const sourcesTotal = round2(fromAccounts + fromCounter + onAccountCredit);

  return {
    date,
    fromAccounts: round2(fromAccounts),
    fromCounter: round2(fromCounter),
    onAccountCredit: round2(onAccountCredit),
    receivedByMethod,
    receivedTotal,
    expensesByMethod,
    expensesTotal: round2(Object.values(expensesByMethod).reduce((a, b) => a + b, 0)),
    cashExpenses: round2(expensesByMethod.cash),
    sourcesTotal,
    balanced: Math.abs(sourcesTotal - receivedTotal) < 0.01,
    accountLines: toLines(perAccount),
    creditLines: toLines(perCredit),
    counterByMethod,
    expenseLines,
  };
}

/** The saved sheet for one day, or null. */
export async function getCashUp(date: string): Promise<CashUp | null> {
  const row = await db.cashUp.findFirst({
    where: { businessDay: date },
    orderBy: { createdAt: "desc" },
  });
  if (!row?.sheet) return null;
  return row.sheet as unknown as CashUp;
}

/** Recent saved cash-up sheets, newest first, for the history list. */
export async function listCashUps(limit = 60): Promise<CashUp[]> {
  const rows = await db.cashUp.findMany({
    where: { NOT: { sheet: { equals: Prisma.DbNull } } },
    orderBy: { businessDay: "desc" },
    take: Math.min(Math.max(limit, 1), 120),
  });
  const seen = new Set<string>();
  const out: CashUp[] = [];
  for (const r of rows) {
    if (!r.sheet || seen.has(r.businessDay)) continue;
    seen.add(r.businessDay);
    out.push(r.sheet as unknown as CashUp);
  }
  return out;
}

/** Save (replace) the cash-up sheet for its day. */
export async function saveCashUp(sheet: CashUp, who: string): Promise<CashUp> {
  const stored: CashUp = { ...sheet, closedBy: who, closedAt: new Date().toISOString() };
  const t = summaryFor(stored);

  await db.$transaction(async (tx) => {
    await tx.cashUp.deleteMany({ where: { businessDay: sheet.date } });
    await tx.cashUp.create({
      data: {
        businessDay: sheet.date,
        who,
        float: money2(stored.openingFloat),
        expectedCash: money2(t.expectedCash),
        cashExpenses: money2(t.cashExpenses),
        countedCash: money2(stored.countedCash),
        variance: money2(stored.countedCash - t.expectedCash),
        countedCard: money2(stored.countedCard),
        cardVariance: money2(stored.countedCard - t.byMethod.card),
        byMethod: {
          cash: t.byMethod.cash,
          card: t.byMethod.card,
          bank: t.byMethod["bank transfer"],
          account: t.byMethod.other,
          total: t.receivedTotal,
        } as unknown as Prisma.InputJsonValue,
        sheet: stored as unknown as Prisma.InputJsonValue,
        note: stored.note,
      },
    });
  });
  return stored;
}

// Summary numbers used when persisting the row (kept out of cashup-types so the
// client bundle doesn't import server code).
function summaryFor(c: CashUp) {
  const byMethod = zeroSplit();
  for (const l of c.customerLines) byMethod[bucket(l.method)] += Number(l.amount) || 0;
  byMethod.cash += Number(c.otherCash) || 0;
  byMethod.card += Number(c.otherCard) || 0;
  const cashExpenses = c.expenseLines
    .filter((l) => bucket(l.method) === "cash")
    .reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const receivedTotal = Object.values(byMethod).reduce((a, b) => a + b, 0);
  return {
    byMethod,
    cashExpenses: round2(cashExpenses),
    receivedTotal: round2(receivedTotal),
    expectedCash: round2(c.openingFloat + byMethod.cash - cashExpenses),
  };
}
