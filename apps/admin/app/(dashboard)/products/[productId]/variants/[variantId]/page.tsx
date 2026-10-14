import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { editorRevision, getProduct } from "@/app/(dashboard)/products/data";
import { VariantEditor } from "@/components/catalog/variant-editor";
import { getPublicSettings, requireAdmin } from "@/lib/dal";

export const metadata: Metadata = { title: "Size" };

export default async function VariantPage({ params }: PageProps<"/products/[productId]/variants/[variantId]">) {
  await requireAdmin();
  const { productId, variantId } = await params;
  const [product, settings] = await Promise.all([getProduct(productId), getPublicSettings()]);
  if (!product.variants.some((variant) => variant.id === variantId)) notFound();

  return (
    <VariantEditor
      key={editorRevision(product)}
      product={product}
      variantId={variantId}
      currency={settings.currency}
      timezone={settings.timezone}
    />
  );
}
