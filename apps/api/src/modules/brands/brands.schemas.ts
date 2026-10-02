import { z } from "zod";

import { booleanQuery, paginationQuerySchema, slugSchema } from "../../shared/schemas.js";

const brandBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: slugSchema.optional(),
  logoUrl: z.url().max(500).nullish(),
  isActive: z.boolean().optional(),
});

export const createBrandBodySchema = brandBodySchema;

export const updateBrandBodySchema = brandBodySchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Provide at least one field to update");

export const listBrandsQuerySchema = paginationQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(200).default(200),
  search: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((value) => value || undefined),
  includeInactive: booleanQuery,
});

export type CreateBrandInput = z.infer<typeof createBrandBodySchema>;
export type UpdateBrandInput = z.infer<typeof updateBrandBodySchema>;
export type ListBrandsQuery = z.infer<typeof listBrandsQuerySchema>;
