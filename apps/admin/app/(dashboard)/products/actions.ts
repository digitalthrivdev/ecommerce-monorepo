"use server";

import { randomBytes } from "node:crypto";
import { refresh } from "next/cache";
import { BARCODE_PATTERN, GST_RATE_PATTERN, HSN_PATTERN, SKU_PATTERN } from "@shop/validation";
import { z } from "zod";

import { apiFailure, validationFailure } from "@/lib/action-errors";
import { ApiError, apiFetch } from "@/lib/api";
import { idSchema, optionalPositiveDecimal, optionalText, positiveDecimal, slugInput, text } from "@/lib/form-schemas";
import { MAX_SPECIFICATIONS, type DetailsDraft } from "@/lib/product-editor";
import type { ActionResult, ProductDetail } from "@/lib/types";
import { suggestSku, type VariantDraft, type VariantsPayload } from "@/lib/variant-drafts";

const MAX_QUANTITY_PER_ITEM = 50;
const MAX_WEIGHT_GRAMS = 1_000_000;
/** Select value for "no brand" and "not specified"; Radix Select cannot use an empty value. */
const NONE = "none";

const optionalPattern = (pattern: RegExp, message: string) =>
  z
    .string()
    .trim()
    .refine((value) => value === "" || pattern.test(value), message)
    .transform((value) => value || null);

const optionalWholeNumber = (max: number, message: string) =>
  z
    .string()
    .trim()
    .refine((value) => value === "" || (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= max), message)
    .transform((value) => (value ? Number(value) : null));

const skuInput = z
  .string()
  .trim()
  .toUpperCase()
  .regex(SKU_PATTERN, "Use letters, digits, dots, dashes or underscores, e.g. TSHIRT-M-BLK");

/** Rows left completely empty are dropped. */
const specificationsInput = z
  .array(z.object({ name: z.string().trim(), value: z.string().trim() }))
  .transform((rows) => rows.filter((row) => row.name || row.value))
  .pipe(
    z
      .array(
        z.object({
          name: text(50).min(1, "Give every specification a name"),
          value: text(500).min(1, "Give every specification a value"),
        }),
      )
      .max(MAX_SPECIFICATIONS, `Use at most ${MAX_SPECIFICATIONS} specifications`),
  );

const productSchema = z.object({
  categoryId: z.string().trim().min(1, "Choose a category").max(64),
  brandId: z
    .string()
    .trim()
    .max(64)
    .transform((value) => (value && value !== NONE ? value : null)),
  name: text(200).min(1, "Enter a name"),
  slug: slugInput,
  description: optionalText(2000),
  tags: z
    .string()
    .transform((value) => [...new Set(value.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean))])
    .pipe(z.array(z.string().max(50, "Keep each tag under 50 characters")).max(30, "Use at most 30 tags")),
  hsnCode: optionalPattern(HSN_PATTERN, "Enter 4 to 8 digits"),
  gstRate: z
    .string()
    .trim()
    .regex(GST_RATE_PATTERN, "Enter the GST rate, e.g. 5 or 18, or 0 for exempt goods"),
  manufacturerName: optionalText(200),
  manufacturerAddress: optionalText(500),
  countryOfOrigin: optionalText(100),
  specifications: specificationsInput,
  isActive: z.boolean(),
});

const dimensionInput = optionalPositiveDecimal("Enter centimetres like 30 or 12.5, or leave it empty");

/** A new product starts with one variant; more sizes are added on the product page. */
const firstVariantSchema = z
  .object({
    sku: z.union([z.literal(""), skuInput]),
    barcode: optionalPattern(BARCODE_PATTERN, "Use 4 to 32 letters or digits"),
    quantity: optionalPositiveDecimal("Enter a pack size like 1, 500 or 0.5"),
    unit: optionalText(20),
    maxOrderQuantity: optionalWholeNumber(MAX_QUANTITY_PER_ITEM, `Enter a whole number from 1 to ${MAX_QUANTITY_PER_ITEM}, or leave it empty`),
    price: positiveDecimal("Enter a price like 499 or 499.50"),
    compareAtPrice: optionalPositiveDecimal("Enter a price like 699, or leave it empty"),
    weightGrams: optionalWholeNumber(MAX_WEIGHT_GRAMS, "Enter the weight in whole grams, or leave it empty"),
    lengthCm: dimensionInput,
    breadthCm: dimensionInput,
    heightCm: dimensionInput,
  })
  .refine((variant) => variant.compareAtPrice === null || Number(variant.compareAtPrice) >= Number(variant.price), {
    path: ["compareAtPrice"],
    message: "The compare-at price can't be lower than the price",
  });

type Failure = Extract<ActionResult, { ok: false }>;

/** Prefixes a step's failure so people know which part did not save. */
function partly(saved: string[], failure: Failure): Failure {
  if (saved.length === 0) return failure;
  return { ...failure, error: `${saved.join(" and ")} saved, but ${failure.error.charAt(0).toLowerCase()}${failure.error.slice(1)}` };
}

function detailsBody(details: z.infer<typeof productSchema>) {
  const { slug, ...data } = details;
  return { ...data, ...(slug && { slug }) };
}

export type SaveProductInput = {
  productId: string;
  details?: DetailsDraft;
  variants?: VariantsPayload;
};

/**
 * Saves everything changed on the product or size page in one go: sizes first (the step most
 * likely to be refused, e.g. a code already in use), then details.
 */
export async function saveProductChanges(input: SaveProductInput): Promise<ActionResult> {
  if (!idSchema.safeParse(input.productId).success) return { ok: false, error: "Invalid request" };
  const productPath = `/products/${encodeURIComponent(input.productId)}`;

  const details = input.details ? productSchema.safeParse(input.details) : null;
  if (details && !details.success) return validationFailure(details.error);

  const saved: string[] = [];
  const finish = (failure: Failure) => {
    if (saved.length > 0) refresh();
    return partly(saved, failure);
  };

  if (input.variants) {
    try {
      await apiFetch<ProductDetail>(`${productPath}/variants`, { method: "PUT", body: input.variants });
      saved.push("Sizes");
    } catch (error) {
      if (error instanceof ApiError && error.code === "SKU_TAKEN") {
        return finish({ ok: false, error: "Sizes not saved: another product already uses one of these codes" });
      }
      const failure = apiFailure(error, undefined, { fullPaths: true });
      return finish({ ...failure, error: `Sizes not saved: ${failure.error}` });
    }
  }

  if (details?.success) {
    try {
      await apiFetch(productPath, { method: "PATCH", body: detailsBody(details.data) });
      saved.push("Details");
    } catch (error) {
      return finish(apiFailure(error, { field: "slug", message: "Another product already uses this web address name" }));
    }
  }

  refresh();
  return { ok: true, message: saved.length ? "Saved" : "Nothing to save" };
}

export type CreateProductInput = {
  details: DetailsDraft;
  variant: Omit<VariantDraft, "key" | "id" | "values" | "isActive">;
  images: string[];
};

export type CreateProductResult =
  | { ok: true; href: string; warning?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Creates the product with its first size and price, then adds its photos. Stock starts at 0. */
export async function createProduct(input: CreateProductInput): Promise<CreateProductResult> {
  const details = productSchema.safeParse(input.details);
  const variant = firstVariantSchema.safeParse(input.variant);
  if (!details.success || !variant.success) {
    return validationFailure(new z.ZodError([...(details.error?.issues ?? []), ...(variant.error?.issues ?? [])]));
  }
  const images = z.array(z.url().max(500)).max(20).safeParse(input.images);
  if (!images.success) return { ok: false, error: "Check the photos" };

  const first = variant.data;
  const autoSku = first.sku === "";
  const generatedSku = suggestSku(details.data.name, [`${first.quantity ?? ""}${first.unit ?? ""}`]).slice(0, 57).replace(/-+$/, "") || "ITEM";
  const request = (sku: string) =>
    apiFetch<ProductDetail>("/products", {
      method: "POST",
      body: { ...detailsBody(details.data), options: [], variants: [{ ...first, sku: first.sku || sku }] },
    });

  let product: ProductDetail;
  try {
    try {
      product = await request(generatedSku);
    } catch (error) {
      if (!(autoSku && error instanceof ApiError && error.code === "SKU_TAKEN")) throw error;
      product = await request(`${generatedSku}-${randomBytes(3).toString("hex").toUpperCase()}`);
    }
  } catch (error) {
    if (error instanceof ApiError && error.code === "SKU_TAKEN") {
      return { ok: false, error: error.message, fieldErrors: { sku: "Another product already uses this code" } };
    }
    return apiFailure(error, { field: "slug", message: "Another product already uses this web address name" });
  }

  const href = `/products/${product.id}`;
  const productPath = `/products/${encodeURIComponent(product.id)}`;

  for (const url of images.data) {
    try {
      await apiFetch(`${productPath}/images`, { method: "POST", body: { url, variantId: null } });
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      return { ok: true, href, warning: `Product saved, but a photo could not be added (${error.message}). Add it below.` };
    }
  }

  return { ok: true, href };
}

const MAX_BULK_DELETE = 100;

type BulkDeleteResponse = {
  deleted: number;
  hidden: number;
  skipped: Array<{ id: string; name: string; reason: string }>;
  notFound: number;
};

export type DeleteProductsResult = { ok: true; message: string; deleted: number; hidden: number } | Failure;

const products = (count: number) => `${count} ${count === 1 ? "product" : "products"}`;

/**
 * Deletes never-ordered products and hides ordered ones, which old orders and invoices still show.
 * `leaving`: the caller opens another page after a delete, so the current one (a deleted product) isn't refreshed.
 */
export async function deleteProducts(ids: string[], { leaving = false } = {}): Promise<DeleteProductsResult> {
  const parsed = z.array(idSchema).min(1).max(MAX_BULK_DELETE).safeParse(ids);
  if (!parsed.success) return { ok: false, error: `Choose 1 to ${MAX_BULK_DELETE} products` };

  let result: BulkDeleteResponse;
  try {
    result = await apiFetch<BulkDeleteResponse>("/products/bulk-delete", { method: "POST", body: { ids: parsed.data } });
  } catch (error) {
    return apiFailure(error);
  }

  const { deleted, hidden, skipped } = result;
  const parts: string[] = [];
  if (deleted > 0) parts.push(`Deleted ${products(deleted)}.`);
  if (hidden > 0) parts.push(`${hidden === 1 ? "1 has" : `${hidden} have`} orders, so ${hidden === 1 ? "it's" : "they're"} hidden from the app instead.`);
  if (skipped.length > 0) {
    const names = skipped.map((product) => product.name).join(", ");
    parts.push(`Not deleted (picked on the home screen; remove ${skipped.length === 1 ? "it" : "them"} in Appearance first): ${names}.`);
  }
  if (hidden > 0 || (deleted > 0 && !leaving)) refresh();
  if (deleted === 0 && hidden === 0) return { ok: false, error: parts.join(" ") || "These products were already deleted." };
  return { ok: true, message: parts.join(" "), deleted, hidden };
}

const imageTarget = z.object({ productId: idSchema, imageId: idSchema });

async function imageRequest(path: string, init: Parameters<typeof apiFetch>[1], message: string): Promise<ActionResult> {
  try {
    await apiFetch(path, init);
  } catch (error) {
    return apiFailure(error);
  }
  refresh();
  return { ok: true, message };
}

const imagesPath = (productId: string) => `/products/${encodeURIComponent(productId)}/images`;

export async function addProductImage(input: { productId: string; url: string; variantId: string | null }): Promise<ActionResult> {
  const parsed = z
    .object({ productId: idSchema, url: z.url("Enter a full URL starting with https://").max(500), variantId: idSchema.nullable() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request" };

  const { productId, ...body } = parsed.data;
  return imageRequest(imagesPath(productId), { method: "POST", body }, "Photo added");
}

export async function setImageVariant(input: { productId: string; imageId: string; variantId: string | null }): Promise<ActionResult> {
  const parsed = imageTarget.extend({ variantId: idSchema.nullable() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };

  const { productId, imageId, variantId } = parsed.data;
  return imageRequest(
    `${imagesPath(productId)}/${encodeURIComponent(imageId)}`,
    { method: "PATCH", body: { variantId } },
    variantId ? "Photo shown for that size" : "Photo shown for every size",
  );
}

export async function deleteProductImage(input: { productId: string; imageId: string }): Promise<ActionResult> {
  const parsed = imageTarget.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };

  const { productId, imageId } = parsed.data;
  return imageRequest(`${imagesPath(productId)}/${encodeURIComponent(imageId)}`, { method: "DELETE" }, "Photo removed");
}

export async function reorderProductImages(input: { productId: string; imageIds: string[] }): Promise<ActionResult> {
  const parsed = z.object({ productId: idSchema, imageIds: z.array(idSchema).min(1).max(20) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };

  const { productId, imageIds } = parsed.data;
  return imageRequest(`${imagesPath(productId)}/order`, { method: "PUT", body: { imageIds } }, "Photo order saved");
}
