-- CreateTable
CREATE TABLE "OrderRating" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "deliveryRating" INTEGER NOT NULL,
    "itemsRating" INTEGER,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderRating_orderId_key" ON "OrderRating"("orderId");

-- CreateIndex
CREATE INDEX "OrderRating_createdAt_idx" ON "OrderRating"("createdAt");

-- AddForeignKey
ALTER TABLE "OrderRating" ADD CONSTRAINT "OrderRating_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma cannot express CHECK constraints in the schema.
ALTER TABLE "OrderRating" ADD CONSTRAINT "OrderRating_deliveryRating_check" CHECK ("deliveryRating" BETWEEN 1 AND 5);
ALTER TABLE "OrderRating" ADD CONSTRAINT "OrderRating_itemsRating_check" CHECK ("itemsRating" IS NULL OR "itemsRating" BETWEEN 1 AND 5);
ALTER TABLE "OrderRating" ADD CONSTRAINT "OrderRating_comment_check" CHECK (char_length("comment") <= 500);
