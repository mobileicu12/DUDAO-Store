import "server-only";
import type { Expense as ExpenseRow } from "@prisma/client";
import { db, invalid, money2, num } from "./db";
import type { Expense } from "./expenses-types";

/**
 * Shop expenses — rent, stock purchases, utilities, wages, transport, etc.
 * Recorded for the books, and pre-filled into the cash-up closing sheet so the
 * cash that left the drawer is accounted for.
 *
 * Constants and the row type live in ./expenses-types (client-safe); this file
 * is the server side only.
 */

export { EXPENSE_CATEGORIES, EXPENSE_METHODS } from "./expenses-types";
export type { Expense } from "./expenses-types";

function toRecord(row: ExpenseRow): Expense {
  return {
    id: row.id,
    date: row.date.toISOString(),
    category: row.category,
    description: row.description,
    amount: num(row.amount),
    method: row.method,
    note: row.note,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listExpenses(): Promise<Expense[]> {
  const rows = await db.expense.findMany({ orderBy: { date: "desc" }, take: 500 });
  return rows.map(toRecord);
}

export async function addExpense(input: {
  date?: string;
  category: string;
  description?: string;
  amount: number;
  method?: string;
  note?: string;
  createdBy?: string;
}): Promise<Expense> {
  if (!(input.amount > 0)) throw invalid("A positive amount is required.");
  if (!input.category?.trim()) throw invalid("Pick a category.");

  const row = await db.expense.create({
    data: {
      date: input.date ? new Date(input.date) : new Date(),
      category: input.category.trim(),
      description: (input.description ?? "").trim(),
      amount: money2(input.amount),
      method: (input.method ?? "cash").trim(),
      note: (input.note ?? "").trim(),
      createdBy: input.createdBy ?? "",
    },
  });
  return toRecord(row);
}

export async function deleteExpense(id: string): Promise<void> {
  await db.expense.delete({ where: { id } }).catch(() => {
    throw invalid("Expense not found.");
  });
}

/** Expenses within a day range — for the cash-up closing sheet. */
export async function expensesBetween(start: Date, end: Date): Promise<Expense[]> {
  const rows = await db.expense.findMany({
    where: { date: { gte: start, lte: end } },
    orderBy: { date: "asc" },
  });
  return rows.map(toRecord);
}
