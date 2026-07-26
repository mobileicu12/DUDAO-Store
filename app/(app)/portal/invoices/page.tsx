import type { Metadata } from "next";
import InvoicesClient from "./InvoicesClient";

export const metadata: Metadata = { title: "Invoices" };

export default function InvoicesPage() {
  return <InvoicesClient />;
}
