import { router } from "expo-router";

import type { HomeLink } from "./types";

export function openCategory(category: { id: string; name: string }) {
  router.push({ pathname: "/category/[id]", params: { id: category.id, name: category.name } });
}

export function openBrand(brand: { id: string; name: string }) {
  router.push({ pathname: "/brand/[id]", params: { id: brand.id, name: brand.name } });
}

/** `variantId` picks the variant the page opens on. */
export function openProduct(productId: string, variantId?: string | null) {
  router.push({ pathname: "/product/[id]", params: variantId ? { id: productId, variant: variantId } : { id: productId } });
}

/** Where a banner or offer goes; plain ones are not tappable. */
export function linkAction(link: HomeLink) {
  return link.type === "category" ? () => openCategory(link.category) : undefined;
}
