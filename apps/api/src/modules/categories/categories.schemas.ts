import { z } from "zod";

import { booleanQuery, paginationQuerySchema, slugSchema } from "../../shared/schemas.js";

const categoryBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: slugSchema.optional(),
  imageUrl: z.url().max(500).nullish(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

export const createCategoryBodySchema = categoryBodySchema;

export const updateCategoryBodySchema = categoryBodySchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Provide at least one field to update");

export const listCategoriesQuerySchema = paginationQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(100),
  includeInactive: booleanQuery,
});

export type CreateCategoryInput = z.infer<typeof createCategoryBodySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategoryBodySchema>;
