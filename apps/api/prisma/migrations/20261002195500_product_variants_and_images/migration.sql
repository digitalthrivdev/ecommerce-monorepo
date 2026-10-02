-- Products become parents of variants. Every existing product gets one default variant that takes
-- over its unit and quantity, and every store listing, cart item and order item is moved onto it.

-- CreateTable
CREATE TABLE "ProductOption" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductOptionValue" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductOptionValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "unit" TEXT,
    "quantity" DECIMAL(10,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariantOptionValue" (
    "variantId" TEXT NOT NULL,
    "optionValueId" TEXT NOT NULL,

    CONSTRAINT "ProductVariantOptionValue_pkey" PRIMARY KEY ("variantId","optionValueId")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "url" TEXT NOT NULL,
    "altText" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- One default variant per product
INSERT INTO "ProductVariant" ("id", "productId", "sku", "unit", "quantity", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p."id", upper(p."slug"), p."unit", p."quantity", true, p."createdAt", CURRENT_TIMESTAMP
FROM "Product" p;

-- Existing product images become the first image of the product
INSERT INTO "ProductImage" ("id", "productId", "url", "sortOrder", "createdAt")
SELECT gen_random_uuid()::text, p."id", p."imageUrl", 0, p."updatedAt"
FROM "Product" p
WHERE p."imageUrl" IS NOT NULL;

-- Store listings
ALTER TABLE "StoreProduct" DROP CONSTRAINT "StoreProduct_productId_fkey";
DROP INDEX "StoreProduct_productId_idx";
DROP INDEX "StoreProduct_storeId_productId_key";
ALTER TABLE "StoreProduct" ADD COLUMN "variantId" TEXT;
UPDATE "StoreProduct" sp SET "variantId" = v."id" FROM "ProductVariant" v WHERE v."productId" = sp."productId";
ALTER TABLE "StoreProduct" ALTER COLUMN "variantId" SET NOT NULL;
ALTER TABLE "StoreProduct" DROP COLUMN "productId";

-- Cart items
ALTER TABLE "CartItem" DROP CONSTRAINT "CartItem_productId_fkey";
DROP INDEX "CartItem_cartId_productId_key";
ALTER TABLE "CartItem" ADD COLUMN "variantId" TEXT;
UPDATE "CartItem" ci SET "variantId" = v."id" FROM "ProductVariant" v WHERE v."productId" = ci."productId";
ALTER TABLE "CartItem" ALTER COLUMN "variantId" SET NOT NULL;
ALTER TABLE "CartItem" DROP COLUMN "productId";

-- Order items keep productId and gain the variant and a fuller snapshot
ALTER TABLE "OrderItem" ADD COLUMN "imageUrl" TEXT,
ADD COLUMN "mrp" DECIMAL(10,2),
ADD COLUMN "sku" TEXT,
ADD COLUMN "variantId" TEXT,
ADD COLUMN "variantName" TEXT NOT NULL DEFAULT '';
UPDATE "OrderItem" oi SET "variantId" = v."id", "sku" = v."sku" FROM "ProductVariant" v WHERE v."productId" = oi."productId";
ALTER TABLE "OrderItem" ALTER COLUMN "variantId" SET NOT NULL;
ALTER TABLE "OrderItem" ALTER COLUMN "sku" SET NOT NULL;

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "imageUrl",
DROP COLUMN "quantity",
DROP COLUMN "unit";

-- CreateIndex
CREATE UNIQUE INDEX "ProductOption_productId_name_key" ON "ProductOption"("productId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOptionValue_optionId_value_key" ON "ProductOptionValue"("optionId", "value");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_sku_key" ON "ProductVariant"("sku");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_sortOrder_idx" ON "ProductVariant"("productId", "sortOrder");

-- CreateIndex
CREATE INDEX "ProductVariant_barcode_idx" ON "ProductVariant"("barcode");

-- CreateIndex
CREATE INDEX "ProductVariantOptionValue_optionValueId_idx" ON "ProductVariantOptionValue"("optionValueId");

-- CreateIndex
CREATE INDEX "ProductImage_productId_sortOrder_idx" ON "ProductImage"("productId", "sortOrder");

-- CreateIndex
CREATE INDEX "ProductImage_variantId_idx" ON "ProductImage"("variantId");

-- CreateIndex
CREATE INDEX "CartItem_variantId_idx" ON "CartItem"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_cartId_variantId_key" ON "CartItem"("cartId", "variantId");

-- CreateIndex
CREATE INDEX "OrderItem_variantId_idx" ON "OrderItem"("variantId");

-- CreateIndex
CREATE INDEX "StoreProduct_variantId_idx" ON "StoreProduct"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreProduct_storeId_variantId_key" ON "StoreProduct"("storeId", "variantId");

-- AddForeignKey
ALTER TABLE "ProductOption" ADD CONSTRAINT "ProductOption_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOptionValue" ADD CONSTRAINT "ProductOptionValue_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "ProductOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantOptionValue" ADD CONSTRAINT "ProductVariantOptionValue_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantOptionValue" ADD CONSTRAINT "ProductVariantOptionValue_optionValueId_fkey" FOREIGN KEY ("optionValueId") REFERENCES "ProductOptionValue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreProduct" ADD CONSTRAINT "StoreProduct_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
