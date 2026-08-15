import type { Metadata } from "next";
import LogsClient from "./LogsClient";

export const metadata: Metadata = { title: "Activity log" };

export default function LogsPage() {
  return <LogsClient />;
}
