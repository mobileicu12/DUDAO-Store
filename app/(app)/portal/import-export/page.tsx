import type { Metadata } from "next";
import ImportExportClient from "./ImportExportClient";

export const metadata: Metadata = { title: "Import & export" };

export default function ImportExportPage() {
  return <ImportExportClient />;
}
