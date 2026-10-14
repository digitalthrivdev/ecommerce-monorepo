import type { Metadata } from "next";

import { editorRevision, getProduct } from "@/app/(dashboard)/products/data";
import { AddReviewDialog } from "@/components/catalog/add-review-dialog";
import { DeleteProductButton } from "@/components/catalog/delete-products";
import { ProductEditor } from "@/components/catalog/product-editor";
import { Pill } from "@/components/status-pill";
import { apiFetch } from "@/lib/api";
import { getPublicSettings, requireAdmin } from "@/lib/dal";
import type { Brand, Category, Paginated } from "@/lib/types";

export const metadata: Metadata = { title: "Product" };

export default async function ProductPage({ params }: PageProps<"/products/[productId]">) {
  await requireAdmin();
  const { productId } = await params;
  const [product, categories, brands, settings] = await Promise.all([
    getProduct(productId),
    apiFetch<Paginated<Category>>("/categories", { query: { includeInactive: true, limit: 200 } }),
    apiFetch<Paginated<Brand>>("/brands", { query: { includeInactive: true, limit: 200 } }),
    getPublicSettings(),
  ]);
  const parent = categories.items.find((category) => category.id === product.category.parentId);
  const inStock = product.variants.some((variant) => variant.isActive && variant.stockQuantity > 0);

  return (
    <ProductEditor
      key={editorRevision(product)}
      product={product}
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
        ) : inStock ? (
          <Pill tone="green" size="md">
            Selling
          </Pill>
        ) : (
          <Pill tone="amber" size="md">
            Out of stock
          </Pill>
        )
      }
      actions={
        <>
          <AddReviewDialog productId={product.id} productName={product.name} />
          <DeleteProductButton id={product.id} name={product.name} />
        </>
      }
    />
  );
}
