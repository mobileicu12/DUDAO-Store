import type { Metadata } from "next";
import CollectionsClient from "./CollectionsClient";

export const metadata: Metadata = { title: "Collections" };

export default function CollectionsPage() {
  return <CollectionsClient />;
}
