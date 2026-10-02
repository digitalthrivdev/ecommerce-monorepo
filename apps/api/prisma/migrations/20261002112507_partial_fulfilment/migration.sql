-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "unavailableQuantity" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "refundedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;
