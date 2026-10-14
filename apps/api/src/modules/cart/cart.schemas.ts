import { z } from "zod";

import { MAX_QUANTITY_PER_ITEM } from "../products/catalog.js";

const idSchema = z.string().trim().min(1).max(64);

const quantitySchema = z.number().int().min(1).max(MAX_QUANTITY_PER_ITEM);

export const addCartItemBodySchema = z.object({
  variantId: idSchema,
  quantity: quantitySchema.default(1),
});

export const updateCartItemBodySchema = z.object({
  quantity: quantitySchema,
});

export const cartItemParamsSchema = z.object({
  id: idSchema,
});

export type AddCartItemInput = z.infer<typeof addCartItemBodySchema>;
