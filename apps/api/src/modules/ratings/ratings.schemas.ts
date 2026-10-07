import { z } from "zod";

import { paginationQuerySchema } from "../../shared/schemas.js";

const stars = z.number().int().min(1).max(5);

export const rateOrderBodySchema = z.object({
  deliveryRating: stars,
  itemsRating: stars.nullish(),
  comment: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((value) => value || undefined),
});

/** Ratings with 1 or 2 stars for the delivery or the items. Dates are days in the client's time zone. */
const lowRatingsFields = paginationQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

const datesInOrder = (query: { from?: string; to?: string }) => !query.from || !query.to || query.from <= query.to;
const datesMessage = { message: "The start date must be on or before the end date", path: ["from"] };

export const storeLowRatingsQuerySchema = lowRatingsFields.refine(datesInOrder, datesMessage);

export const adminLowRatingsQuerySchema = lowRatingsFields
  .extend({ storeId: z.string().trim().min(1).max(64).optional() })
  .refine(datesInOrder, datesMessage);

export type RateOrderInput = z.infer<typeof rateOrderBodySchema>;
export type LowRatingsQuery = z.infer<typeof adminLowRatingsQuerySchema>;
