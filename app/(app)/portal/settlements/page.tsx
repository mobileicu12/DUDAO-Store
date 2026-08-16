import type { Metadata } from "next";
import SettlementsClient from "./SettlementsClient";

export const metadata: Metadata = { title: "Settlement" };

export default function SettlementsPage() {
  return <SettlementsClient />;
}
