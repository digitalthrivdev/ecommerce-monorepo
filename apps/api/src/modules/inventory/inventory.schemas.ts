import { z } from "zod";

import { InventoryAdjustmentReason } from "../../generated/prisma/client";
import { paginationQuerySchema } from "../../shared/schemas.js";

const idSchema = z.string().trim().min(1).max(64);
const MAX_STOCK = 1_000_000;

export const inventoryItemParamsSchema = z.object({
  variantId: idSchema,
});

export const listInventoryQuerySchema = paginationQuerySchema.extend({
  search: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((value) => value || undefined),
  maxQuantity: z.coerce.number().int().min(0).max(MAX_STOCK).optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  categoryId: idSchema.optional(),
  /** `low`: active and at or below the low-stock threshold; `out`: no stock. */
  stock: z.enum(["low", "out"]).optional(),
});

/** Reasons staff can give; ORDER_UNAVAILABLE is recorded by the system when picking. */
const manualReasonSchema = z.enum([
  InventoryAdjustmentReason.RESTOCK,
  InventoryAdjustmentReason.CORRECTION,
  InventoryAdjustmentReason.DAMAGE,
]);

const adjustmentDetails = {
  reason: manualReasonSchema,
  note: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((value) => value || undefined),
};

export const adjustInventoryBodySchema = z.union(
  [
    z.object({ quantity: z.number().int().min(0).max(MAX_STOCK), ...adjustmentDetails }).strict(),
    z
      .object({
        delta: z
          .number()
          .int()
          .min(-MAX_STOCK)
          .max(MAX_STOCK)
          .refine((value) => value !== 0, "Delta cannot be 0"),
        ...adjustmentDetails,
      })
      .strict(),
  ],
  { error: 'Provide either "quantity" (set stock) or "delta" (adjust stock), not both, and a reason' },
);

export const listAdjustmentsQuerySchema = paginationQuerySchema;

export type ListInventoryQuery = z.infer<typeof listInventoryQuerySchema>;
export type AdjustInventoryInput = z.infer<typeof adjustInventoryBodySchema>;
export type ListAdjustmentsQuery = z.infer<typeof listAdjustmentsQuerySchema>;
