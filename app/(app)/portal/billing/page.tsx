import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import TillClient from "./TillClient";

export const metadata: Metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

export default async function BillingPage() {
  // Tax rate comes from the server so the cart total matches what the invoice
  // will actually be charged at.
  const settings = await getSettings();
  return (
    <TillClient taxRate={settings.taxRate} currency={settings.currency} />
  );
}
