import type { Metadata } from "next";

import { ProductEditor } from "@/components/catalog/product-editor";
import { apiFetch } from "@/lib/api";
import { getPublicSettings, requireAdmin } from "@/lib/dal";
import type { Brand, Category, Paginated } from "@/lib/types";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  await requireAdmin();
  const [categories, brands, settings] = await Promise.all([
    apiFetch<Paginated<Category>>("/categories", { query: { includeInactive: true, limit: 200 } }),
    apiFetch<Paginated<Brand>>("/brands", { query: { includeInactive: true, limit: 200 } }),
    getPublicSettings(),
  ]);

  return (
    <ProductEditor
      categories={categories.items}
      brands={brands.items}
      currency={settings.currency}
      timezone={settings.timezone}
      description="Photos and price can be set here; stock on the Stock page once it is saved."
    />
  );
}
