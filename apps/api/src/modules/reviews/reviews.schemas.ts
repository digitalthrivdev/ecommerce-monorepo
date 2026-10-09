import { z } from "zod";

import { paginationQuerySchema } from "../../shared/schemas.js";

export const MAX_REVIEW_LENGTH = 500;

export const reviewBodySchema = z.object({
  rating: z.number().int().min(1).max(5),
  /** Omitted keeps the current comment; null or empty removes it. */
  comment: z.string().trim().max(MAX_REVIEW_LENGTH).nullish(),
});

export const productReviewsQuerySchema = paginationQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const adminReviewsQuerySchema = paginationQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  hidden: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export const updateReviewBodySchema = z.object({ isHidden: z.boolean() }).strict();

export type ReviewInput = z.infer<typeof reviewBodySchema>;
export type ProductReviewsQuery = z.infer<typeof productReviewsQuerySchema>;
export type AdminReviewsQuery = z.infer<typeof adminReviewsQuerySchema>;
