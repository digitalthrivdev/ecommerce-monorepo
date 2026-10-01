import { router } from "expo-router";

import type { HomeLink } from "./types";

export function openCategory(category: { id: string; name: string }) {
  router.push({ pathname: "/category/[id]", params: { id: category.id, name: category.name } });
}

export function openProduct(productId: string) {
  router.push({ pathname: "/product/[id]", params: { id: productId } });
}

/** Where a banner or offer goes; plain ones are not tappable. */
export function linkAction(link: HomeLink) {
  return link.type === "category" ? () => openCategory(link.category) : undefined;
}
