import Constants from "expo-constants";
import * as Linking from "expo-linking";
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

/** The website's product page, which opens the app when it's installed; the app's own link in builds without SITE_DOMAIN. */
export function productShareUrl(productId: string) {
  const siteDomain: unknown = Constants.expoConfig?.extra?.siteDomain;
  return typeof siteDomain === "string" ? `https://${siteDomain}/p/${encodeURIComponent(productId)}` : Linking.createURL(`product/${productId}`);
}

/** Where a banner or offer goes; plain ones are not tappable. */
export function linkAction(link: HomeLink) {
  if (link.type === "category") return () => openCategory(link.category);
  if (link.type === "product") return () => openProduct(link.product.id);
  return undefined;
}
