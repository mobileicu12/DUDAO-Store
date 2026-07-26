import type { Metadata } from "next";
import ProductForm, { EMPTY_PRODUCT } from "../ProductForm";

export const metadata: Metadata = { title: "New product" };

export default function NewProductPage() {
  return <ProductForm initial={EMPTY_PRODUCT} />;
}
