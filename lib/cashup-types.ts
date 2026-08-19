// Client-safe cash-up types and arithmetic. No server imports.
//
// The closing screen and the PDF builder both need the maths, so the maths
// lives here (lib/cashup.ts reaches the database and can't be pulled into a
// client bundle). Ported from MOBILE ICU so both portals count a day the same
// way — two independent counts (by source and by method) that must agree.

export type CashUpLine = { name: string; amount: number; method: string };

export type MethodSplit = {
  cash: number;
  card: number;
  "bank transfer": number;
  other: number;
};
export const zeroSplit = (): MethodSplit => ({
  cash: 0,
  card: 0,
  "bank transfer": 0,
  other: 0,
});

/** Map any stored method onto one of the four cash-up buckets. */
export const bucket = (m: string | null | undefined): keyof MethodSplit => {
  const k = (m || "other").toLowerCase();
  if (k === "cash") return "cash";
  if (k === "card") return "card";
  if (k === "bank" || k === "bank transfer") return "bank transfer";
  return "other";
};

export const round2 = (n: number) => Math.round(n * 100) / 100;

export type CashUp = {
  date: string; // YYYY-MM-DD
  openingFloat: number; // counted into the drawer at the start of the day
  countedCash: number; // counted out of the drawer at close
  countedCard: number; // card terminal total, if reconciled too
  note: string;
  closedBy: string;
  closedAt: string; // ISO

  // ---- The sheet staff fill in at closing ----
  // Typed from scratch rather than pre-filled from the system: the point is to
  // compare an independent count against what the portal thinks.
  customerLines: CashUpLine[]; // "Ravi paid cash 100"
  otherCash: number; // counter / mix sales taken in cash
  otherCard: number; // counter / mix sales taken on card
  // Expenses ARE pre-filled from the Expenses page, then editable.
  expenseLines: CashUpLine[];
};

export const emptyCashUp = (date: string): CashUp => ({
  date,
  openingFloat: 0,
  countedCash: 0,
  countedCard: 0,
  note: "",
  closedBy: "",
  closedAt: "",
  customerLines: [],
  otherCash: 0,
  otherCard: 0,
  expenseLines: [],
});

// Totals for a hand-entered sheet.
export function sheetTotals(
  c: Pick<CashUp, "customerLines" | "otherCash" | "otherCard" | "expenseLines">,
) {
  const byMethod = zeroSplit();
  let fromCustomers = 0;
  for (const l of c.customerLines) {
    const amt = Number(l.amount) || 0;
    byMethod[bucket(l.method)] += amt;
    fromCustomers += amt;
  }
  byMethod.cash += Number(c.otherCash) || 0;
  byMethod.card += Number(c.otherCard) || 0;
  const other = (Number(c.otherCash) || 0) + (Number(c.otherCard) || 0);
  const expenses = c.expenseLines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const cashExpenses = c.expenseLines
    .filter((l) => bucket(l.method) === "cash")
    .reduce((s, l) => s + (Number(l.amount) || 0), 0);
  for (const k of Object.keys(byMethod) as (keyof MethodSplit)[]) {
    byMethod[k] = round2(byMethod[k]);
  }
  return {
    fromCustomers: round2(fromCustomers),
    fromOther: round2(other),
    byMethod,
    receivedTotal: round2(fromCustomers + other),
    expensesTotal: round2(expenses),
    cashExpenses: round2(cashExpenses),
  };
}

export type DayTakings = {
  date: string;
  fromAccounts: number;
  fromCounter: number;
  onAccountCredit: number;
  receivedByMethod: MethodSplit;
  receivedTotal: number;
  expensesByMethod: MethodSplit;
  expensesTotal: number;
  cashExpenses: number;
  sourcesTotal: number;
  balanced: boolean;
  /** Who paid what, per registered customer — against their bills. */
  accountLines: CashUpLine[];
  /** Named customers who paid onto their account with no open bill. */
  creditLines: CashUpLine[];
  /** fromCounter, split by method. */
  counterByMethod: MethodSplit;
  /** Expenses recorded for the day, used to pre-fill the closing sheet. */
  expenseLines: CashUpLine[];
};
