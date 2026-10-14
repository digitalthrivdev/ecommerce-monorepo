import { z } from "zod";

import { positiveDecimalSchema, slugify } from "../../shared/schemas.js";
import { MAX_QUANTITY_PER_ITEM } from "../products/catalog.js";
import {
  MAX_WEIGHT_GRAMS,
  barcodeSchema,
  compareAtPriceProblem,
  dimensionSchema,
  gstRateSchema,
  hsnCodeSchema,
  optionNameSchema,
  optionValueSchema,
  skuSchema,
  tagsSchema,
} from "../products/products.schemas.js";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 10_000;
const MAX_STOCK = 1_000_000;

export const COLUMNS = [
  "product_handle",
  "name",
  "brand",
  "category",
  "subcategory",
  "description",
  "tags",
  "hsn_code",
  "gst_rate",
  "manufacturer_name",
  "manufacturer_address",
  "country_of_origin",
  "option1_name",
  "option1_value",
  "option2_name",
  "option2_value",
  "option3_name",
  "option3_value",
  "sku",
  "barcode",
  "pack_quantity",
  "unit",
  "max_order_quantity",
  "price",
  "compare_at_price",
  "available",
  "stock",
  "weight_grams",
  "length_cm",
  "breadth_cm",
  "height_cm",
  "image_url",
] as const;

export type Column = (typeof COLUMNS)[number];

export const REQUIRED_COLUMNS: Column[] = ["name", "category", "sku", "price"];

/** Describe the product rather than one variant, so every row of a product must agree on them. */
export const PRODUCT_COLUMNS: Column[] = [
  "name",
  "brand",
  "category",
  "subcategory",
  "description",
  "tags",
  "hsn_code",
  "gst_rate",
  "manufacturer_name",
  "manufacturer_address",
  "country_of_origin",
];

export const OPTION_SLOTS = [
  ["option1_name", "option1_value"],
  ["option2_name", "option2_value"],
  ["option3_name", "option3_value"],
] as const satisfies readonly (readonly [Column, Column])[];

/** Blank cells arrive as null, columns missing from the file as undefined. */
const text = (max: number) => z.string().max(max, `At most ${max} characters`).nullish();

const yesNo = z
  .string()
  .toLowerCase()
  .pipe(z.enum(["yes", "no", "y", "n", "true", "false", "1", "0"], { error: 'Use "yes" or "no"' }))
  .transform((value) => ["yes", "y", "true", "1"].includes(value));

const wholeNumber = (min: number, max: number) =>
  z
    .string()
    .regex(/^\d+$/, "Must be a whole number")
    .transform(Number)
    .pipe(z.number().min(min, `Must be at least ${min}`).max(max, `Must be at most ${max}`));

const categoryName = z
  .string()
  .max(100, "At most 100 characters")
  .refine((value) => !value.includes(">"), "Categories are at most two levels deep: use the category and subcategory columns");

export const rowSchema = z
  .object({
    product_handle: z
      .string()
      .max(100, "At most 100 characters")
      .transform(slugify)
      .pipe(z.string().min(1, "Must contain letters or digits"))
      .nullish(),
    /** Name and category are required on a product's first row; with a product_handle, later rows may leave them blank. */
    name: text(200),
    brand: text(100),
    category: categoryName.nullish(),
    subcategory: categoryName.nullish(),
    description: text(2000),
    tags: z
      .string()
      .transform((value) => value.split(",").map((tag) => tag.trim()).filter(Boolean))
      .pipe(tagsSchema)
      .nullish(),
    hsn_code: hsnCodeSchema.nullish(),
    gst_rate: gstRateSchema.nullish(),
    manufacturer_name: text(200),
    manufacturer_address: text(500),
    country_of_origin: text(100),
    option1_name: optionNameSchema.nullish(),
    option1_value: optionValueSchema.nullish(),
    option2_name: optionNameSchema.nullish(),
    option2_value: optionValueSchema.nullish(),
    option3_name: optionNameSchema.nullish(),
    option3_value: optionValueSchema.nullish(),
    sku: z.string({ error: "Required" }).pipe(skuSchema),
    barcode: barcodeSchema.nullish(),
    pack_quantity: positiveDecimalSchema.nullish(),
    unit: text(20),
    max_order_quantity: wholeNumber(1, MAX_QUANTITY_PER_ITEM).nullish(),
    price: z.string({ error: "Required" }).pipe(positiveDecimalSchema),
    compare_at_price: positiveDecimalSchema.nullish(),
    available: yesNo.nullish(),
    stock: wholeNumber(0, MAX_STOCK).nullish(),
    weight_grams: wholeNumber(1, MAX_WEIGHT_GRAMS).nullish(),
    length_cm: dimensionSchema.nullish(),
    breadth_cm: dimensionSchema.nullish(),
    height_cm: dimensionSchema.nullish(),
    image_url: z.url({ protocol: /^https?$/, error: "Must be a full address starting with http:// or https://" }).max(500).nullish(),
  })
  .superRefine((row, ctx) => {
    const names: string[] = [];
    for (const [index, [nameColumn, valueColumn]] of OPTION_SLOTS.entries()) {
      const name = row[nameColumn];
      const value = row[valueColumn];
      if (name && !value) ctx.addIssue({ code: "custom", path: [valueColumn], message: `Give a value for ${name}` });
      if (value && !name) ctx.addIssue({ code: "custom", path: [nameColumn], message: "Give the option's name, e.g. Size" });
      if (!name) continue;
      if (index > 0 && !row[OPTION_SLOTS[index - 1]![0]]) {
        ctx.addIssue({ code: "custom", path: [nameColumn], message: `Fill ${OPTION_SLOTS[index - 1]![0]} first` });
      }
      if (names.some((other) => other.toLowerCase() === name.toLowerCase())) {
        ctx.addIssue({ code: "custom", path: [nameColumn], message: `Option "${name}" is given twice` });
      }
      names.push(name);
    }
    const priceProblem = row.price ? compareAtPriceProblem(row.price, row.compare_at_price) : null;
    if (priceProblem) ctx.addIssue({ code: "custom", path: ["compare_at_price"], message: priceProblem });
  });

export type ImportRow = z.infer<typeof rowSchema>;

export const importBodySchema = z.object({
  // Characters, not bytes; the byte size is checked separately.
  csv: z.string().min(1, "The file is empty").max(MAX_FILE_BYTES),
});

export const importParamsSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{24}$/, "Unknown import"),
});
