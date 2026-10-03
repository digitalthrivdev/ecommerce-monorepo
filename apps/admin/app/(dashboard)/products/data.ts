import "server-only";

import { notFound } from "next/navigation";

import { ApiError, apiFetch } from "@/lib/api";
import type { ProductDetail, ProductListings } from "@/lib/types";

/**
 * Key for the product and size editors, so they start over with fresh data after a save. Photos
 * are left out: they save on their own and must not wipe unsaved typing.
 */
export function editorRevision(product: ProductDetail, listings: ProductListings) {
  return JSON.stringify([{ ...product, images: null }, listings]);
}

/** A product and its prices and stock at every store; a missing product shows the not-found page. */
export async function getProductWithListings(id: string) {
  const path = `/products/${encodeURIComponent(id)}`;
  try {
    const [product, listings] = await Promise.all([apiFetch<ProductDetail>(path), apiFetch<ProductListings>(`${path}/listings`)]);
    return { product, listings };
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }
}
