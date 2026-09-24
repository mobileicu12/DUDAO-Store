-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sku" TEXT NOT NULL DEFAULT '',
    "barcode" TEXT NOT NULL DEFAULT '',
    "price" DECIMAL(12,2) NOT NULL,
    "compareAtPrice" DECIMAL(12,2),
    "priceWholesale" DECIMAL(12,2),
    "priceShop" DECIMAL(12,2),
    "priceEbay" DECIMAL(12,2),
    "priceAmazon" DECIMAL(12,2),
    "stock" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductVariant_productId_position_idx" ON "ProductVariant"("productId", "position");

-- CreateIndex
CREATE INDEX "ProductVariant_sku_idx" ON "ProductVariant"("sku");

-- CreateIndex
CREATE INDEX "ProductVariant_barcode_idx" ON "ProductVariant"("barcode");

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN "variantId" TEXT;
ALTER TABLE "InvoiceLine" ADD COLUMN "variantTitle" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "InvoiceLine_variantId_idx" ON "InvoiceLine"("variantId");

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
