import type { Metadata } from "next";
import BackupsClient from "./BackupsClient";

export const metadata: Metadata = { title: "Backup" };

export default function BackupsPage() {
  return <BackupsClient />;
}
