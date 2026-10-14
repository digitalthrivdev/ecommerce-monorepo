import "server-only";

import { notFound } from "next/navigation";

import { ApiError, apiFetch } from "@/lib/api";
import type { ProductDetail } from "@/lib/types";

/**
 * Key for the product and size editors, so they start over with fresh data after a save. Photos
 * are left out: they save on their own and must not wipe unsaved typing.
 */
export function editorRevision(product: ProductDetail) {
  return JSON.stringify({ ...product, images: null });
}

/** A product with every size's price and stock; a missing product shows the not-found page. */
export async function getProduct(id: string) {
  try {
    return await apiFetch<ProductDetail>(`/products/${encodeURIComponent(id)}`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }
}
