import { z } from "zod";

import { paginationQuerySchema } from "../../shared/schemas.js";

/** Products one customer can save; enough for any real list, and it keeps GET /wishlist/ids small. */
export const MAX_WISHLIST_ITEMS = 500;

const idSchema = z.string().trim().min(1).max(64);

export const wishlistQuerySchema = paginationQuerySchema.extend({
  /** The store whose price and stock to show; without it, items have no `product`. */
  storeId: idSchema.optional(),
});

export const wishlistParamsSchema = z.object({ productId: idSchema });

export type WishlistQuery = z.infer<typeof wishlistQuerySchema>;
