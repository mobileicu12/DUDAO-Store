import type { Metadata } from "next";
import TillItemsClient from "./TillItemsClient";

export const metadata: Metadata = { title: "Till items" };

export default function TillPage() {
  return <TillItemsClient />;
}
