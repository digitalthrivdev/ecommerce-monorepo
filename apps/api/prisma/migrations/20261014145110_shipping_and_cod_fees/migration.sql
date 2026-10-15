-- Rename the delivery fee columns to shipping fee, keeping their data, and add the cash-on-delivery
-- fee plus the weight-based shipping rates.

ALTER TABLE "Order" RENAME COLUMN "deliveryFee" TO "shippingFee";
ALTER TABLE "Order" RENAME COLUMN "deliveryFeeGstRate" TO "shippingFeeGstRate";
ALTER TABLE "Order" RENAME COLUMN "deliveryFeeTax" TO "shippingFeeTax";
ALTER TABLE "Order"
  ADD COLUMN "codFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "codFeeTax" DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE "Order" RENAME CONSTRAINT "Order_deliveryFeeTax_check" TO "Order_shippingFeeTax_check";
ALTER TABLE "Order" ADD CONSTRAINT "Order_codFeeTax_check" CHECK ("codFeeTax" >= 0 AND "codFeeTax" <= "codFee");

ALTER TABLE "PlatformSettings" RENAME COLUMN "deliveryFee" TO "shippingFee";
ALTER TABLE "PlatformSettings" RENAME COLUMN "deliveryFeeGstRate" TO "shippingFeeGstRate";
ALTER TABLE "PlatformSettings" RENAME COLUMN "freeDeliveryThreshold" TO "freeShippingThreshold";
ALTER TABLE "PlatformSettings"
  ADD COLUMN "codFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "weightSlabs" JSONB;

ALTER TABLE "PlatformSettings" RENAME CONSTRAINT "PlatformSettings_deliveryFeeGstRate_check" TO "PlatformSettings_shippingFeeGstRate_check";
