import { z } from "zod";

import {
  booleanQuery,
  paginationQuerySchema,
  positiveDecimalSchema,
  slugSchema,
} from "../../shared/schemas.js";

const idSchema = z.string().trim().min(1).max(64);

const searchQuery = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((value) => value || undefined);

const productBodySchema = z.object({
  categoryId: idSchema,
  name: z.string().trim().min(1).max(200),
  slug: slugSchema.optional(),
  description: z.string().trim().max(2000).nullish(),
  imageUrl: z.url().max(500).nullish(),
  unit: z.string().trim().min(1).max(20).nullish(),
  quantity: positiveDecimalSchema.nullish(),
  isActive: z.boolean().optional(),
});

export const createProductBodySchema = productBodySchema;

export const updateProductBodySchema = productBodySchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Provide at least one field to update");

export const listProductsQuerySchema = paginationQuerySchema.extend({
  categoryId: idSchema.optional(),
  search: searchQuery,
  includeInactive: booleanQuery,
});

export const storeParamsSchema = z.object({
  storeId: idSchema,
});

export const storeProductParamsSchema = z.object({
  storeId: idSchema,
  productId: idSchema,
});

export const listStoreProductsQuerySchema = paginationQuerySchema.extend({
  categoryId: idSchema.optional(),
  search: searchQuery,
  includeUnavailable: booleanQuery,
});

export const createStoreProductBodySchema = z.object({
  productId: idSchema,
  sellingPrice: positiveDecimalSchema,
  mrp: positiveDecimalSchema.nullish(),
  isAvailable: z.boolean().optional(),
});

export const updateStoreProductBodySchema = z
  .object({
    sellingPrice: positiveDecimalSchema,
    mrp: positiveDecimalSchema.nullable(),
    isAvailable: z.boolean(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Provide at least one field to update");

export type CreateProductInput = z.infer<typeof createProductBodySchema>;
export type UpdateProductInput = z.infer<typeof updateProductBodySchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type ListStoreProductsQuery = z.infer<typeof listStoreProductsQuerySchema>;
export type CreateStoreProductInput = z.infer<typeof createStoreProductBodySchema>;
export type UpdateStoreProductInput = z.infer<typeof updateStoreProductBodySchema>;
