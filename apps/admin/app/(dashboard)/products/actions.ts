"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { apiFailure, validationFailure } from "@/lib/action-errors";
import { ApiError, apiFetch } from "@/lib/api";
import {
  formChecked,
  formText,
  idSchema,
  optionalPositiveDecimal,
  optionalText,
  positiveDecimal,
  slugInput,
  text,
} from "@/lib/form-schemas";
import type { ActionResult, ProductDetail } from "@/lib/types";
import type { VariantsPayload } from "@/lib/variant-drafts";

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
  .regex(/^[A-Z0-9][A-Z0-9._-]{0,63}$/, "Use letters, digits, dots, dashes or underscores, e.g. AMUL-MILK-1L");

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
  hsnCode: optionalPattern(/^\d{4,8}$/, "Enter 4 to 8 digits"),
  gstRate: optionalPattern(/^\d{1,2}(\.\d{1,2})?$/, "Enter a percentage like 5 or 18"),
  manufacturerName: optionalText(200),
  manufacturerAddress: optionalText(500),
  countryOfOrigin: optionalText(100),
  fssaiLicense: optionalPattern(/^\d{14}$/, "Enter the 14-digit licence number"),
  shelfLife: optionalText(100),
  ingredients: optionalText(2000),
  isActive: z.boolean(),
});

/** A new product starts with one variant; more are added in the variants editor. */
const firstVariantSchema = z.object({
  sku: skuInput,
  quantity: optionalPositiveDecimal("Enter a pack size like 1, 500 or 0.5"),
  unit: optionalText(20),
  maxOrderQuantity: optionalMaxPerOrder,
});

export async function saveProduct(formData: FormData): Promise<ActionResult> {
  const id = formText(formData, "id") || undefined;
  if (id && !idSchema.safeParse(id).success) return { ok: false, error: "Invalid request" };
  const parsed = productSchema.safeParse({
    categoryId: formText(formData, "categoryId"),
    brandId: formText(formData, "brandId"),
    name: formText(formData, "name"),
    slug: formText(formData, "slug"),
    description: formText(formData, "description"),
    tags: formText(formData, "tags"),
    isVeg: formText(formData, "isVeg"),
    hsnCode: formText(formData, "hsnCode"),
    gstRate: formText(formData, "gstRate"),
    manufacturerName: formText(formData, "manufacturerName"),
    manufacturerAddress: formText(formData, "manufacturerAddress"),
    countryOfOrigin: formText(formData, "countryOfOrigin"),
    fssaiLicense: formText(formData, "fssaiLicense"),
    shelfLife: formText(formData, "shelfLife"),
    ingredients: formText(formData, "ingredients"),
    isActive: formChecked(formData, "isActive"),
  });
  const variant = id
    ? null
    : firstVariantSchema.safeParse({
        sku: formText(formData, "sku"),
        quantity: formText(formData, "quantity"),
        unit: formText(formData, "unit"),
        maxOrderQuantity: formText(formData, "maxOrderQuantity"),
      });
  if (!parsed.success || (variant && !variant.success)) {
    const issues = [...(parsed.error?.issues ?? []), ...(variant?.error?.issues ?? [])];
    return validationFailure(new z.ZodError(issues));
  }

  const { slug, ...data } = parsed.data;
  const body = {
    ...data,
    ...(slug && { slug }),
    ...(variant?.success && { options: [], variants: [variant.data] }),
  };

  let product: ProductDetail;
  try {
    product = await apiFetch<ProductDetail>(id ? `/products/${encodeURIComponent(id)}` : "/products", {
      method: id ? "PATCH" : "POST",
      body,
    });
  } catch (error) {
    if (error instanceof ApiError && error.code === "SKU_TAKEN") {
      return { ok: false, error: error.message, fieldErrors: { sku: "Another variant already uses this SKU" } };
    }
    return apiFailure(error, { field: "slug", message: "Another product already uses this slug" });
  }

  if (!id) {
    redirect(`/products/${product.id}`);
  }
  refresh();
  return { ok: true, message: "Product updated" };
}

/** Replaces the product's options and variants; field errors are keyed by full path ("variants.2.sku"). */
export async function saveVariants(productId: string, payload: VariantsPayload): Promise<ActionResult> {
  if (!idSchema.safeParse(productId).success) return { ok: false, error: "Invalid request" };

  try {
    await apiFetch(`/products/${encodeURIComponent(productId)}/variants`, { method: "PUT", body: payload });
  } catch (error) {
    return apiFailure(error, undefined, { fullPaths: true });
  }

  refresh();
  return { ok: true, message: "Variants saved" };
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
  return imageRequest(imagesPath(productId), { method: "POST", body }, "Image added");
}

export async function setImageVariant(input: { productId: string; imageId: string; variantId: string | null }): Promise<ActionResult> {
  const parsed = imageTarget.extend({ variantId: idSchema.nullable() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };

  const { productId, imageId, variantId } = parsed.data;
  return imageRequest(
    `${imagesPath(productId)}/${encodeURIComponent(imageId)}`,
    { method: "PATCH", body: { variantId } },
    variantId ? "Image shown for the variant" : "Image shown for every variant",
  );
}

export async function deleteProductImage(input: { productId: string; imageId: string }): Promise<ActionResult> {
  const parsed = imageTarget.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };

  const { productId, imageId } = parsed.data;
  return imageRequest(`${imagesPath(productId)}/${encodeURIComponent(imageId)}`, { method: "DELETE" }, "Image removed");
}

export async function reorderProductImages(input: { productId: string; imageIds: string[] }): Promise<ActionResult> {
  const parsed = z.object({ productId: idSchema, imageIds: z.array(idSchema).min(1).max(20) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };

  const { productId, imageIds } = parsed.data;
  return imageRequest(`${imagesPath(productId)}/order`, { method: "PUT", body: { imageIds } }, "Image order saved");
}

const listingSchema = z
  .object({
    storeId: idSchema,
    variantId: idSchema,
    mode: z.enum(["create", "update"]),
    sellingPrice: positiveDecimal("Enter the selling price like 68 or 68.50"),
    mrp: optionalPositiveDecimal("Enter the MRP like 70 or 70.50, or leave it empty"),
    isAvailable: z.boolean(),
  })
  .refine((listing) => listing.mrp === null || Number(listing.mrp) >= Number(listing.sellingPrice), {
    path: ["mrp"],
    message: "MRP cannot be lower than the selling price",
  });

export async function saveListing(formData: FormData): Promise<ActionResult> {
  const parsed = listingSchema.safeParse({
    storeId: formText(formData, "storeId"),
    variantId: formText(formData, "variantId"),
    mode: formText(formData, "mode"),
    sellingPrice: formText(formData, "sellingPrice"),
    mrp: formText(formData, "mrp"),
    isAvailable: formChecked(formData, "isAvailable"),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const { storeId, variantId, mode, sellingPrice, mrp, isAvailable } = parsed.data;
  const storePath = `/stores/${encodeURIComponent(storeId)}/variants`;

  try {
    if (mode === "create") {
      await apiFetch(storePath, { method: "POST", body: { variantId, sellingPrice, mrp, isAvailable } });
    } else {
      await apiFetch(`${storePath}/${encodeURIComponent(variantId)}`, { method: "PATCH", body: { sellingPrice, mrp } });
    }
  } catch (error) {
    if (error instanceof ApiError && error.code === "ALREADY_LISTED") {
      return { ok: false, error: error.message, fieldErrors: { sellingPrice: "Already listed at this store" } };
    }
    return apiFailure(error);
  }

  refresh();
  return { ok: true, message: mode === "create" ? "Listed at the store" : "Price updated" };
}
