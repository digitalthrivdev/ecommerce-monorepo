"use server";

import { randomBytes } from "node:crypto";
import { refresh } from "next/cache";
import { BARCODE_PATTERN, FSSAI_PATTERN, GST_RATE_PATTERN, HSN_PATTERN, SKU_PATTERN } from "@grocery/validation";
import { z } from "zod";

import { apiFailure, validationFailure } from "@/lib/action-errors";
import { ApiError, apiFetch } from "@/lib/api";
import {
  idSchema,
  optionalPositiveDecimal,
  optionalText,
  positiveDecimal,
  slugInput,
  text,
} from "@/lib/form-schemas";
import type { DetailsDraft, PriceRow, StockRow } from "@/lib/product-editor";
import type { ActionResult, ProductDetail } from "@/lib/types";
import { suggestSku, type VariantsPayload } from "@/lib/variant-drafts";

const MAX_QUANTITY_PER_ITEM = 50;
/** Select value for "no brand" and "not specified"; Radix Select cannot use an empty value. */
const NONE = "none";

const optionalPattern = (pattern: RegExp, message: string) =>
  z
    .string()
    .trim()
    .refine((value) => value === "" || pattern.test(value), message)
    .transform((value) => value || null);

const optionalMaxPerOrder = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= MAX_QUANTITY_PER_ITEM),
    `Enter a whole number from 1 to ${MAX_QUANTITY_PER_ITEM}, or leave it empty`,
  )
  .transform((value) => (value ? Number(value) : null));

const skuInput = z
  .string()
  .trim()
  .toUpperCase()
  .regex(SKU_PATTERN, "Use letters, digits, dots, dashes or underscores, e.g. AMUL-MILK-1L");

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
  isVeg: z.enum(["", NONE, "veg", "non-veg"]).transform((value) => (value === "veg" ? true : value === "non-veg" ? false : null)),
  hsnCode: optionalPattern(HSN_PATTERN, "Enter 4 to 8 digits"),
  gstRate: z
    .string()
    .trim()
    .regex(GST_RATE_PATTERN, "Enter the GST rate, e.g. 5 or 18, or 0 for exempt goods"),
  manufacturerName: optionalText(200),
  manufacturerAddress: optionalText(500),
  countryOfOrigin: optionalText(100),
  fssaiLicense: optionalPattern(FSSAI_PATTERN, "Enter the 14-digit licence number"),
  shelfLife: optionalText(100),
  ingredients: optionalText(2000),
  isActive: z.boolean(),
});

const barcodeInput = optionalPattern(BARCODE_PATTERN, "Use 4 to 32 letters or digits");

/** A new product starts with one variant; more sizes are added on the product page. */
const firstVariantSchema = z.object({
  sku: z.union([z.literal(""), skuInput]),
  barcode: barcodeInput,
  quantity: optionalPositiveDecimal("Enter a pack size like 1, 500 or 0.5"),
  unit: optionalText(20),
  maxOrderQuantity: optionalMaxPerOrder,
});

const priceRowSchema = z
  .object({
    storeId: idSchema,
    variantId: z.string().max(64),
    sku: z.string().max(64).optional(),
    sellingPrice: positiveDecimal("Enter a price like 68 or 68.50"),
    mrp: optionalPositiveDecimal("Enter the MRP like 70, or leave it empty"),
    isAvailable: z.boolean(),
  })
  .refine((row) => row.mrp === null || Number(row.mrp) >= Number(row.sellingPrice), {
    path: ["mrp"],
    message: "MRP can't be lower than your price",
  });

const stockRowSchema = z.object({
  storeId: idSchema,
  variantId: z.string().max(64),
  sku: z.string().max(64).optional(),
  delta: z.number().int().min(-1_000_000).max(1_000_000),
});

const MAX_ROWS = 1000;
const priceRowsSchema = z.array(priceRowSchema).max(MAX_ROWS);
const stockRowsSchema = z.array(stockRowSchema).max(MAX_ROWS);

type Failure = Extract<ActionResult, { ok: false }>;

/** Prefixes a step's failure so people know which part did not save. */
function partly(saved: string[], failure: Failure): Failure {
  if (saved.length === 0) return failure;
  return { ...failure, error: `${saved.join(" and ")} saved, but ${failure.error.charAt(0).toLowerCase()}${failure.error.slice(1)}` };
}

const stockPath = (row: { storeId: string; variantId: string }) =>
  `/stores/${encodeURIComponent(row.storeId)}/inventory/${encodeURIComponent(row.variantId)}`;

async function applyStock(rows: z.infer<typeof stockRowSchema>[], note: string) {
  for (const row of rows.filter((candidate) => candidate.delta !== 0)) {
    await apiFetch(stockPath(row), {
      method: "PATCH",
      body: { delta: row.delta, reason: row.delta > 0 ? "RESTOCK" : "CORRECTION", note },
    });
  }
}

function detailsBody(details: z.infer<typeof productSchema>) {
  const { slug, ...data } = details;
  return { ...data, ...(slug && { slug }) };
}

export type SaveProductInput = {
  productId: string;
  details?: DetailsDraft;
  variants?: VariantsPayload;
  prices?: PriceRow[];
  stock?: StockRow[];
};

/**
 * Saves everything changed on the product or size page in one go: sizes first (the step most
 * likely to be refused, e.g. a code already in use), then details, prices and stock.
 */
export async function saveProductChanges(input: SaveProductInput): Promise<ActionResult> {
  if (!idSchema.safeParse(input.productId).success) return { ok: false, error: "Invalid request" };
  const productPath = `/products/${encodeURIComponent(input.productId)}`;

  const details = input.details ? productSchema.safeParse(input.details) : null;
  if (details && !details.success) return validationFailure(details.error);
  const prices = priceRowsSchema.safeParse(input.prices ?? []);
  const stock = stockRowsSchema.safeParse(input.stock ?? []);
  if (!prices.success || !stock.success) return { ok: false, error: "Check the prices and stock" };

  const saved: string[] = [];
  const finish = (failure: Failure) => {
    if (saved.length > 0) refresh();
    return partly(saved, failure);
  };

  let idBySku = new Map<string, string>();
  if (input.variants) {
    try {
      const product = await apiFetch<ProductDetail>(`${productPath}/variants`, { method: "PUT", body: input.variants });
      idBySku = new Map(product.variants.map((variant) => [variant.sku, variant.id]));
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

  // Rows of sizes added in this save get their new ids from the product code.
  const resolve = <T extends { variantId: string; sku?: string }>(rows: T[]) =>
    rows
      .map(({ sku, ...row }) => ({ ...row, variantId: row.variantId || idBySku.get(sku?.trim().toUpperCase() ?? "") || "" }))
      .filter((row) => row.variantId !== "");
  const priceData = resolve(prices.data);
  const stockData = resolve(stock.data);

  if (priceData.length > 0) {
    try {
      await apiFetch(`${productPath}/prices`, { method: "PUT", body: { prices: priceData } });
      saved.push("Prices");
    } catch (error) {
      const failure = apiFailure(error);
      return finish({ ...failure, error: `Prices not saved: ${failure.error}` });
    }
  }

  if (stockData.length > 0) {
    try {
      await applyStock(stockData, "Changed on the product page");
      saved.push("Stock");
    } catch (error) {
      const failure = apiFailure(error);
      return finish({ ...failure, error: `Stock not saved: ${failure.error}` });
    }
  }

  refresh();
  return { ok: true, message: saved.length ? "Saved" : "Nothing to save" };
}

export type CreateProductInput = {
  details: DetailsDraft;
  variant: { sku: string; barcode: string; quantity: string; unit: string; maxOrderQuantity: string };
  /** Rows with an empty variantId; the new size's id is filled in here. */
  prices: PriceRow[];
  stock: StockRow[];
  images: string[];
};

export type CreateProductResult =
  | { ok: true; href: string; warning?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Creates the product with its first size, then its prices, starting stock and photos. */
export async function createProduct(input: CreateProductInput): Promise<CreateProductResult> {
  const details = productSchema.safeParse(input.details);
  const variant = firstVariantSchema.safeParse(input.variant);
  if (!details.success || !variant.success) {
    return validationFailure(new z.ZodError([...(details.error?.issues ?? []), ...(variant.error?.issues ?? [])]));
  }
  const prices = priceRowsSchema.safeParse(input.prices);
  const stock = stockRowsSchema.safeParse(input.stock);
  const images = z.array(z.url().max(500)).max(20).safeParse(input.images);
  if (!prices.success || !stock.success || !images.success) return { ok: false, error: "Check the price, stock and photos" };

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
  const variantId = product.variants[0]!.id;
  const productPath = `/products/${encodeURIComponent(product.id)}`;
  const problems: string[] = [];

  if (prices.data.length > 0) {
    try {
      await apiFetch(`${productPath}/prices`, { method: "PUT", body: { prices: prices.data.map((row) => ({ ...row, variantId })) } });
      await applyStock(
        stock.data.map((row) => ({ ...row, variantId })),
        "Starting stock",
      );
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      problems.push(`the price or stock (${error.message})`);
    }
  }

  for (const url of images.data) {
    try {
      await apiFetch(`${productPath}/images`, { method: "POST", body: { url, variantId: null } });
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      problems.push(`a photo (${error.message})`);
      break;
    }
  }

  return { ok: true, href, ...(problems.length > 0 && { warning: `Product saved, but ${problems.join(" and ")} could not be added. Set it below.` }) };
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
