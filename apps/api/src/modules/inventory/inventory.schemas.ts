import { z } from "zod";

import { paginationQuerySchema } from "../../shared/schemas.js";

const idSchema = z.string().trim().min(1).max(64);
const MAX_STOCK = 1_000_000;

export const storeParamsSchema = z.object({
  storeId: idSchema,
});

export const inventoryItemParamsSchema = z.object({
  storeId: idSchema,
  productId: idSchema,
});

export const listInventoryQuerySchema = paginationQuerySchema.extend({
  search: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((value) => value || undefined),
  maxQuantity: z.coerce.number().int().min(0).max(MAX_STOCK).optional(),
  isAvailable: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  categoryId: idSchema.optional(),
  /** `low`: available and at or below the low-stock threshold; `out`: no stock. */
  stock: z.enum(["low", "out"]).optional(),
});

export const adjustInventoryBodySchema = z.union(
  [
    z.object({ quantity: z.number().int().min(0).max(MAX_STOCK) }).strict(),
    z
      .object({
        delta: z
          .number()
          .int()
          .min(-MAX_STOCK)
          .max(MAX_STOCK)
          .refine((value) => value !== 0, "Delta cannot be 0"),
      })
      .strict(),
  ],
  { error: 'Provide either "quantity" (set stock) or "delta" (adjust stock), not both' },
);

export type ListInventoryQuery = z.infer<typeof listInventoryQuerySchema>;
export type AdjustInventoryInput = z.infer<typeof adjustInventoryBodySchema>;
