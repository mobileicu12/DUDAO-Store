import type { Metadata } from "next";
import ExpensesClient from "./ExpensesClient";

export const metadata: Metadata = { title: "Expenses" };

export default function ExpensesPage() {
  return <ExpensesClient />;
}
