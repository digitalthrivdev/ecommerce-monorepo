-- Prisma cannot express CHECK constraints in the schema.
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_unavailableQuantity_check"
  CHECK ("unavailableQuantity" >= 0 AND "unavailableQuantity" <= "quantity");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_refundedAmount_check"
  CHECK ("refundedAmount" >= 0 AND "refundedAmount" <= "amount");
