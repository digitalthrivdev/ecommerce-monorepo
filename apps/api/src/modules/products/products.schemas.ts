import { BARCODE_PATTERN, FSSAI_PATTERN, GST_RATE_PATTERN, HSN_PATTERN, SKU_PATTERN } from "@grocery/validation";
import { z } from "zod";

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

export const fssaiLicenseSchema = z
  .string()
  .trim()
  .regex(FSSAI_PATTERN, "FSSAI licence number must be 14 digits");

export const skuSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(SKU_PATTERN, "SKU must be letters, digits, dots, dashes or underscores");

export const barcodeSchema = z
  .string()
  .trim()
  .regex(BARCODE_PATTERN, "Barcode must be 4-32 letters or digits");

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
  isVeg: z.boolean().nullish(),
  manufacturerName: optionalText(200),
  manufacturerAddress: optionalText(500),
  countryOfOrigin: optionalText(100),
  fssaiLicense: fssaiLicenseSchema.nullish(),
  shelfLife: optionalText(100),
  ingredients: optionalText(2000),
  isActive: z.boolean().optional(),
});

export const optionNameSchema = z.string().trim().min(1).max(50);
export const optionValueSchema = z.string().trim().min(1).max(50);

const variantInputSchema = z.object({
  /** Existing variant to update; omit to create one. */
  id: idSchema.optional(),
  sku: skuSchema,
  barcode: barcodeSchema.nullish(),
  unit: z.string().trim().min(1).max(20).nullish(),
  quantity: positiveDecimalSchema.nullish(),
  maxOrderQuantity: z.number().int().min(1).max(MAX_QUANTITY_PER_ITEM).nullish(),
  isActive: z.boolean().optional(),
  /** One value per option, in the order of `options`. Empty for a product without options. */
  optionValues: z.array(optionValueSchema).max(MAX_OPTIONS).default([]),
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
  /** Admin filters; they need `includeInactive`. */
  status: z.enum(["active", "hidden"]).optional(),
  selling: z.enum(["yes", "no"]).optional(),
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

export const storeParamsSchema = z.object({
  storeId: idSchema,
});

export const storeProductParamsSchema = z.object({
  storeId: idSchema,
  productId: idSchema,
});

export const storeVariantParamsSchema = z.object({
  storeId: idSchema,
  variantId: idSchema,
});

export const listStoreProductsQuerySchema = paginationQuerySchema.extend({
  categoryId: idSchema.optional(),
  brandId: idSchema.optional(),
  search: searchQuery,
  includeUnavailable: booleanQuery,
});

const idList = z
  .string()
  .transform((value) => [...new Set(value.split(",").map((id) => id.trim()).filter(Boolean))])
  .pipe(z.array(idSchema).min(1, "Give at least one product id").max(30, "Give at most 30 product ids"));

export const alsoBoughtQuerySchema = z.object({
  productIds: idList,
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

export const storeBrandsQuerySchema = z.object({
  categoryId: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const buyAgainQuerySchema = z.object({
  storeId: idSchema,
  limit: z.coerce.number().int().min(1).max(30).default(12),
});

export const createStoreVariantBodySchema = z.object({
  variantId: idSchema,
  sellingPrice: positiveDecimalSchema,
  mrp: positiveDecimalSchema.nullish(),
  isAvailable: z.boolean().optional(),
});

export const updateStoreVariantBodySchema = z
  .object({
    sellingPrice: positiveDecimalSchema,
    mrp: positiveDecimalSchema.nullable(),
    isAvailable: z.boolean(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Provide at least one field to update");

const MAX_PRICE_ROWS = 1000;

/** Prices of a product's variants at many stores at once; missing listings are created. */
export const setPricesBodySchema = z.object({
  prices: z
    .array(
      z.object({
        storeId: idSchema,
        variantId: idSchema,
        sellingPrice: positiveDecimalSchema,
        mrp: positiveDecimalSchema.nullish().transform((value) => value ?? null),
        /** New listings default to available. */
        isAvailable: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(MAX_PRICE_ROWS)
    .refine(
      (rows) => new Set(rows.map((row) => `${row.storeId}:${row.variantId}`)).size === rows.length,
      "Each store and variant can appear only once",
    ),
});

export type CreateProductInput = z.infer<typeof createProductBodySchema>;
export type UpdateProductInput = z.infer<typeof updateProductBodySchema>;
export type VariantsInput = z.infer<typeof variantsBodySchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type AddImageInput = z.infer<typeof addImageBodySchema>;
export type UpdateImageInput = z.infer<typeof updateImageBodySchema>;
export type ListStoreProductsQuery = z.infer<typeof listStoreProductsQuerySchema>;
export type CreateStoreVariantInput = z.infer<typeof createStoreVariantBodySchema>;
export type UpdateStoreVariantInput = z.infer<typeof updateStoreVariantBodySchema>;
export type SetPricesInput = z.infer<typeof setPricesBodySchema>;
