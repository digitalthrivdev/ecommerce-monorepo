import type { Metadata } from "next";

import { ProductEditor } from "@/components/catalog/product-editor";
import { apiFetch } from "@/lib/api";
import { getPublicSettings, requireAdmin } from "@/lib/dal";
import type { Brand, Category, Paginated, Store } from "@/lib/types";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  await requireAdmin();
  const [categories, brands, stores, settings] = await Promise.all([
    apiFetch<Paginated<Category>>("/categories", { query: { includeInactive: true, limit: 200 } }),
    apiFetch<Paginated<Brand>>("/brands", { query: { includeInactive: true, limit: 200 } }),
    apiFetch<Paginated<Store>>("/stores", { query: { includeInactive: true, limit: 100 } }),
    getPublicSettings(),
  ]);

  return (
    <ProductEditor
      stores={stores.items.map(({ id, name, code, status }) => ({ id, name, code, status }))}
      categories={categories.items}
      brands={brands.items}
      currency={settings.currency}
      timezone={settings.timezone}
      description="Photos, price and stock can all be set here."
    />
  );
}
