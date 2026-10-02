import { z } from "zod";

import { booleanQuery, paginationQuerySchema, slugSchema } from "../../shared/schemas.js";

const idSchema = z.string().trim().min(1).max(64);

const categoryBodySchema = z.object({
  /** Makes this a sub-category of a top-level category. */
  parentId: idSchema.nullish(),
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
  limit: z.coerce.number().int().min(1).max(200).default(200),
  /** Only the sub-categories of this category. */
  parentId: idSchema.optional(),
  /** Only top-level categories. */
  topLevel: booleanQuery,
  includeInactive: booleanQuery,
});

export type CreateCategoryInput = z.infer<typeof createCategoryBodySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategoryBodySchema>;
export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;
