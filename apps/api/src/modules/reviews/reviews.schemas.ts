import { z } from "zod";

import { ReviewSource } from "../../generated/prisma/client";
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
  source: z.enum(ReviewSource).optional(),
});

export const updateReviewBodySchema = z.object({ isHidden: z.boolean() }).strict();

export const adminReviewBodySchema = z.object({
  productId: z.string().trim().min(1).max(64),
  authorName: z.string().trim().min(1, "Enter the reviewer's name").max(40, "Keep the name under 40 characters"),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(MAX_REVIEW_LENGTH).nullish(),
});

export type ReviewInput = z.infer<typeof reviewBodySchema>;
export type ProductReviewsQuery = z.infer<typeof productReviewsQuerySchema>;
export type AdminReviewsQuery = z.infer<typeof adminReviewsQuerySchema>;
export type AdminReviewInput = z.infer<typeof adminReviewBodySchema>;
