"use server";

import { refresh } from "next/cache";

import { apiFailure } from "@/lib/action-errors";
import { apiFetch } from "@/lib/api";
import { formText } from "@/lib/form-schemas";
import type { ActionResult, AppearanceProduct, Paginated, ProductDetail, ProductListItem } from "@/lib/types";

/** The editor sends the whole appearance as JSON; the API validates every part. */
export async function saveAppearance(formData: FormData): Promise<ActionResult> {
  let config: unknown;
  try {
    config = JSON.parse(formText(formData, "config"));
  } catch {
    return { ok: false, error: "The changes could not be read. Reload the page and try again." };
  }
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    return { ok: false, error: "The changes could not be read. Reload the page and try again." };
  }

  try {
    await apiFetch("/settings/appearance", { method: "PATCH", body: config });
  } catch (error) {
    return apiFailure(error, undefined, { fullPaths: true });
  }

  refresh();
  return { ok: true, message: "Appearance saved. The apps pick it up the next time they open." };
}

const toSummary = (product: ProductListItem): AppearanceProduct => ({
  id: product.id,
  name: product.name,
  imageUrl: product.imageUrl,
  isActive: product.isActive,
});

/** Products matching a search for the sale hero's featured-product picker. */
export async function searchAppearanceProducts(query: string): Promise<AppearanceProduct[]> {
  const search = query.trim();
  if (search.length < 2) return [];
  try {
    const result = await apiFetch<Paginated<ProductListItem>>("/products", {
      query: { search, includeInactive: true, limit: 12 },
    });
    return result.items.map(toSummary);
  } catch {
    return [];
  }
}

/** Labels for product ids already saved on a sale hero. */
export async function loadAppearanceProducts(ids: string[]): Promise<AppearanceProduct[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];
  const results = await Promise.all(
    unique.map(async (id): Promise<AppearanceProduct | null> => {
      try {
        const product = await apiFetch<ProductDetail>(`/products/${encodeURIComponent(id)}`);
        const image = product.images.find((candidate) => candidate.variantId === null) ?? product.images[0];
        return { id: product.id, name: product.name, imageUrl: image?.url ?? null, isActive: product.isActive };
      } catch {
        return null;
      }
    }),
  );
  return results.filter((product): product is AppearanceProduct => product !== null);
}
