// Client-safe expense constants and types — no server imports, so the
// Expenses screen and the cash-up sheet can use them without dragging the
// database (lib/db) into the browser bundle.

export const EXPENSE_CATEGORIES = [
  "Stock purchase",
  "Rent",
  "Utilities",
  "Wages",
  "Transport",
  "Equipment",
  "Packaging",
  "Marketing",
  "Software",
  "Repairs",
  "Fees",
  "Other",
];

export const EXPENSE_METHODS = ["cash", "card", "bank transfer", "other"];

export type Expense = {
  id: string;
  date: string; // ISO
  category: string;
  description: string;
  amount: number;
  method: string;
  note: string;
  createdBy: string;
  createdAt: string;
};
