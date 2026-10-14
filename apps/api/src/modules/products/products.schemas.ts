import { BARCODE_PATTERN, GST_RATE_PATTERN, HSN_PATTERN, SKU_PATTERN } from "@shop/validation";
import { z } from "zod";

import { Prisma } from "../../generated/prisma/client";
import {
  booleanQuery,
  paginationQuerySchema,
  positiveDecimalSchema,
  slugSchema,
} from "../../shared/schemas.js";
import { MAX_QUANTITY_PER_ITEM } from "./catalog.js";

const idSchema = z.string().trim().min(1).max(64);

const searchQuery = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((value) => value || undefined);

/** Empty text clears the field. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value === undefined ? undefined : value || null));

export const MAX_OPTIONS = 3;
export const MAX_OPTION_VALUES = 30;
export const MAX_VARIANTS = 100;
export const MAX_IMAGES = 20;
const MAX_TAGS = 30;
const MAX_SPECIFICATIONS = 30;
export const MAX_WEIGHT_GRAMS = 1_000_000;
const MAX_DIMENSION_CM = 10_000;

export const gstRateSchema = z
  .string({ error: 'Give the GST rate as a percentage, e.g. "5" or "18", or "0" for exempt goods' })
  .trim()
  .regex(GST_RATE_PATTERN, 'GST rate must be a percentage with up to 2 decimal places, e.g. "5" or "18"');

export const tagsSchema = z
  .array(z.string().trim().toLowerCase().min(1).max(50))
  .max(MAX_TAGS)
  .transform((tags) => [...new Set(tags)]);

export const hsnCodeSchema = z
  .string()
  .trim()
  .regex(HSN_PATTERN, "HSN code must be 4 to 8 digits");

export const skuSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(SKU_PATTERN, "SKU must be letters, digits, dots, dashes or underscores");

export const barcodeSchema = z
  .string()
  .trim()
  .regex(BARCODE_PATTERN, "Barcode must be 4-32 letters or digits");

export const weightGramsSchema = z.number().int().min(1).max(MAX_WEIGHT_GRAMS);

export const dimensionSchema = positiveDecimalSchema.refine(
  (value) => new Prisma.Decimal(value).lte(MAX_DIMENSION_CM),
  `Must be at most ${MAX_DIMENSION_CM} cm`,
);

/** The compare-at price is the higher, struck-through one. */
export function compareAtPriceProblem(price: string | Prisma.Decimal, compareAtPrice: string | Prisma.Decimal | null | undefined) {
  return compareAtPrice != null && new Prisma.Decimal(compareAtPrice).lt(price) ? "The compare-at price cannot be lower than the price" : null;
}

const specificationsSchema = z
  .array(z.object({ name: z.string().trim().min(1).max(50), value: z.string().trim().min(1).max(500) }))
  .max(MAX_SPECIFICATIONS);

const productFieldsSchema = z.object({
  categoryId: idSchema,
  brandId: idSchema.nullish(),
  name: z.string().trim().min(1).max(200),
  slug: slugSchema.optional(),
  description: optionalText(2000),
  tags: tagsSchema.optional(),
  hsnCode: hsnCodeSchema.nullish(),
  // Decides the GST on every sale, so it can't be left out ("0" for exempt goods) or cleared.
  gstRate: gstRateSchema,
  manufacturerName: optionalText(200),
  manufacturerAddress: optionalText(500),
  countryOfOrigin: optionalText(100),
  specifications: specificationsSchema.optional(),
  isActive: z.boolean().optional(),
});

export const optionNameSchema = z.string().trim().min(1).max(50);
export const optionValueSchema = z.string().trim().min(1).max(50);

const variantInputSchema = z
  .object({
    /** Existing variant to update; omit to create one. */
    id: idSchema.optional(),
    sku: skuSchema,
    barcode: barcodeSchema.nullish(),
    unit: z.string().trim().min(1).max(20).nullish(),
    quantity: positiveDecimalSchema.nullish(),
    price: positiveDecimalSchema,
    compareAtPrice: positiveDecimalSchema.nullish(),
    weightGrams: weightGramsSchema.nullish(),
    lengthCm: dimensionSchema.nullish(),
    breadthCm: dimensionSchema.nullish(),
    heightCm: dimensionSchema.nullish(),
    maxOrderQuantity: z.number().int().min(1).max(MAX_QUANTITY_PER_ITEM).nullish(),
    isActive: z.boolean().optional(),
    /** One value per option, in the order of `options`. Empty for a product without options. */
    optionValues: z.array(optionValueSchema).max(MAX_OPTIONS).default([]),
  })
  .superRefine((variant, ctx) => {
    const problem = compareAtPriceProblem(variant.price, variant.compareAtPrice);
    if (problem) ctx.addIssue({ code: "custom", path: ["compareAtPrice"], message: problem });
  });

/**
 * The full set of options and variants of a product. Variants missing from the list are deleted
 * (only possible if they were never ordered).
 */
export const variantsBodySchema = z.object({
  options: z
    .array(z.object({ name: optionNameSchema, values: z.array(optionValueSchema).min(1).max(MAX_OPTION_VALUES) }))
    .max(MAX_OPTIONS)
    .default([]),
  variants: z.array(variantInputSchema).min(1).max(MAX_VARIANTS),
});

export const createProductBodySchema = productFieldsSchema.extend(variantsBodySchema.shape);

export const updateProductBodySchema = productFieldsSchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Provide at least one field to update");

export const listProductsQuerySchema = paginationQuerySchema.extend({
  categoryId: idSchema.optional(),
  brandId: idSchema.optional(),
  search: searchQuery,
  includeInactive: booleanQuery,
  /** Filters; `status` needs `includeInactive`. */
  status: z.enum(["active", "hidden"]).optional(),
  outOfStock: booleanQuery,
  /** Products without a GST rate or HSN code. */
  missingTax: booleanQuery,
});

export const productImageParamsSchema = z.object({
  id: idSchema,
  imageId: idSchema,
});

export const addImageBodySchema = z.object({
  url: z.url().max(500),
  altText: optionalText(200),
  variantId: idSchema.nullish(),
});

export const updateImageBodySchema = z
  .object({
    altText: optionalText(200),
    variantId: idSchema.nullable(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Provide at least one field to update");

export const reorderImagesBodySchema = z.object({
  imageIds: z.array(idSchema).min(1).max(MAX_IMAGES),
});

export const catalogProductParamsSchema = z.object({
  productId: idSchema,
});

export const variantParamsSchema = z.object({
  variantId: idSchema,
});

export const listCatalogQuerySchema = paginationQuerySchema.extend({
  categoryId: idSchema.optional(),
  brandId: idSchema.optional(),
  search: searchQuery,
});

const idList = z
  .string()
  .transform((value) => [...new Set(value.split(",").map((id) => id.trim()).filter(Boolean))])
  .pipe(z.array(idSchema).min(1, "Give at least one product id").max(30, "Give at most 30 product ids"));

export const MAX_BULK_DELETE = 100;

export const deleteProductsBodySchema = z.object({
  ids: z
    .array(idSchema)
    .min(1, "Choose at least one product")
    .max(MAX_BULK_DELETE, `Delete at most ${MAX_BULK_DELETE} products at a time`)
    .transform((ids) => [...new Set(ids)]),
});

export const alsoBoughtQuerySchema = z.object({
  productIds: idList,
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

export const catalogBrandsQuerySchema = z.object({
  categoryId: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const buyAgainQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(30).default(12),
});

/** Quick changes from the product list or inventory; staff may only switch a variant on or off. */
export const updateVariantBodySchema = z
  .object({
    price: positiveDecimalSchema,
    compareAtPrice: positiveDecimalSchema.nullable(),
    isActive: z.boolean(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Provide at least one field to update");

export type CreateProductInput = z.infer<typeof createProductBodySchema>;
export type UpdateProductInput = z.infer<typeof updateProductBodySchema>;
export type VariantsInput = z.infer<typeof variantsBodySchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type AddImageInput = z.infer<typeof addImageBodySchema>;
export type UpdateImageInput = z.infer<typeof updateImageBodySchema>;
export type ListCatalogQuery = z.infer<typeof listCatalogQuerySchema>;
export type UpdateVariantInput = z.infer<typeof updateVariantBodySchema>;
