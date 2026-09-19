import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db, num, numOrNull } from "@/lib/db";
import { channelsFromTags, isChannelTag } from "@/lib/channels";
import ProductForm, { type ProductFormValues } from "../../ProductForm";

export const metadata: Metadata = { title: "Edit product" };
export const dynamic = "force-dynamic";

const str = (n: number | null): string => (n === null ? "" : String(n));

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Loaded on the server so the form is populated on first paint — staff open
  // this from a table row and a spinner here feels like a broken link.
  const product = await db.product.findUnique({
    where: { id },
    include: {
      images: { orderBy: { position: "asc" } },
      collections: { select: { collectionId: true } },
    },
  });

  if (!product) notFound();

  const initial: ProductFormValues = {
    title: product.title,
    descriptionHtml: product.descriptionHtml,
    status: product.status === "DRAFT" ? "DRAFT" : "ACTIVE",
    vendor: product.vendor,
    brand: product.brand,
    model: product.model,
    productType: product.productType,
    sku: product.sku,
    barcode: product.barcode,
    price: String(num(product.price)),
    compareAtPrice: str(numOrNull(product.compareAtPrice)),
    tiers: {
      wholesale: str(numOrNull(product.priceWholesale)),
      shop: str(numOrNull(product.priceShop)),
      ebay: str(numOrNull(product.priceEbay)),
      amazon: str(numOrNull(product.priceAmazon)),
    },
    stock: String(product.stock),
    images: product.images.map((i) => ({ url: i.url, alt: i.alt })),
    channels: channelsFromTags(product.tags),
    // Channel intent is edited via the Channels card, so keep it out of the
    // free-text tag list — otherwise it would show up twice and could be
    // deleted from the wrong place.
    tags: product.tags.filter((t) => !isChannelTag(t)),
    collectionIds: product.collections.map((c) => c.collectionId),
  };

  return <ProductForm productId={id} initial={initial} />;
}
