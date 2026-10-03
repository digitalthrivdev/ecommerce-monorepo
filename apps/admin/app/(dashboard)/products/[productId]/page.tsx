import type { Metadata } from "next";

import { editorRevision, getProductWithListings } from "@/app/(dashboard)/products/data";
import { ProductEditor } from "@/components/catalog/product-editor";
import { Pill } from "@/components/status-pill";
import { apiFetch } from "@/lib/api";
import { getPublicSettings, requireAdmin } from "@/lib/dal";
import type { Brand, Category, Paginated } from "@/lib/types";

export const metadata: Metadata = { title: "Product" };

export default async function ProductPage({ params }: PageProps<"/products/[productId]">) {
  await requireAdmin();
  const { productId } = await params;
  const [{ product, listings }, categories, brands, settings] = await Promise.all([
    getProductWithListings(productId),
    apiFetch<Paginated<Category>>("/categories", { query: { includeInactive: true, limit: 200 } }),
    apiFetch<Paginated<Brand>>("/brands", { query: { includeInactive: true, limit: 200 } }),
    getPublicSettings(),
  ]);
  const parent = categories.items.find((category) => category.id === product.category.parentId);
  const isSelling = listings.items.some((item) => item.listings.some((entry) => entry.listing));

  return (
    <ProductEditor
      key={editorRevision(product, listings)}
      product={product}
      listings={listings}
      stores={listings.items.map((item) => item.store)}
      categories={categories.items}
      brands={brands.items}
      currency={settings.currency}
      timezone={settings.timezone}
      description={[parent ? `${parent.name} › ${product.category.name}` : product.category.name, product.brand?.name]
        .filter(Boolean)
        .join(" · ")}
      status={
        !product.isActive ? (
          <Pill tone="red" size="md">
            Hidden from app
          </Pill>
        ) : isSelling ? (
          <Pill tone="green" size="md">
            Selling
          </Pill>
        ) : (
          <Pill tone="amber" size="md">
            Not selling yet
          </Pill>
        )
      }
    />
  );
}
