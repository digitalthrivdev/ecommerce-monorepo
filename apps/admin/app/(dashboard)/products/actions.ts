"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { apiFailure, validationFailure } from "@/lib/action-errors";
import { apiFetch } from "@/lib/api";
import {
  formChecked,
  formText,
  idSchema,
  optionalPositiveDecimal,
  optionalText,
  optionalUrl,
  positiveDecimal,
  slugInput,
  text,
} from "@/lib/form-schemas";
import type { ActionResult, Product } from "@/lib/types";

const productSchema = z.object({
  id: idSchema.optional(),
  categoryId: z.string().trim().min(1, "Choose a category").max(64),
  name: text(200).min(1, "Enter a name"),
  slug: slugInput,
  description: optionalText(2000),
  imageUrl: optionalUrl,
  unit: optionalText(20),
  quantity: optionalPositiveDecimal("Enter a pack size like 1, 500 or 0.5"),
  isActive: z.boolean(),
});

export async function saveProduct(formData: FormData): Promise<ActionResult> {
  const parsed = productSchema.safeParse({
    id: formText(formData, "id") || undefined,
    categoryId: formText(formData, "categoryId"),
    name: formText(formData, "name"),
    slug: formText(formData, "slug"),
    description: formText(formData, "description"),
    imageUrl: formText(formData, "imageUrl"),
    unit: formText(formData, "unit"),
    quantity: formText(formData, "quantity"),
    isActive: formChecked(formData, "isActive"),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const { id, slug, ...data } = parsed.data;
  const body = { ...data, ...(slug && { slug }) };

  let product: Product;
  try {
    product = await apiFetch<Product>(id ? `/products/${encodeURIComponent(id)}` : "/products", {
      method: id ? "PATCH" : "POST",
      body,
    });
  } catch (error) {
    return apiFailure(error, { field: "slug", message: "Another product already uses this slug" });
  }

  if (!id) {
    redirect(`/products/${product.id}`);
  }
  refresh();
  return { ok: true, message: "Product updated" };
}

const listingSchema = z
  .object({
    storeId: idSchema,
    productId: idSchema,
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
    productId: formText(formData, "productId"),
    mode: formText(formData, "mode"),
    sellingPrice: formText(formData, "sellingPrice"),
    mrp: formText(formData, "mrp"),
    isAvailable: formChecked(formData, "isAvailable"),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const { storeId, productId, mode, sellingPrice, mrp, isAvailable } = parsed.data;
  const storePath = `/stores/${encodeURIComponent(storeId)}/products`;

  try {
    if (mode === "create") {
      await apiFetch(storePath, { method: "POST", body: { productId, sellingPrice, mrp, isAvailable } });
    } else {
      await apiFetch(`${storePath}/${encodeURIComponent(productId)}`, { method: "PATCH", body: { sellingPrice, mrp } });
    }
  } catch (error) {
    return apiFailure(error, { field: "sellingPrice", message: "This product is already listed at this store" });
  }

  refresh();
  return { ok: true, message: mode === "create" ? "Product listed at the store" : "Price updated" };
}
