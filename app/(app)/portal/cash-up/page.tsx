import type { Metadata } from "next";
import CashUpClient from "./CashUpClient";

export const metadata: Metadata = { title: "Cash up" };

export default function CashUpPage() {
  return <CashUpClient />;
}
