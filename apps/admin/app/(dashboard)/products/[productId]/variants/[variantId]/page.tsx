import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { editorRevision, getProductWithListings } from "@/app/(dashboard)/products/data";
import { VariantEditor } from "@/components/catalog/variant-editor";
import { getPublicSettings, requireAdmin } from "@/lib/dal";

export const metadata: Metadata = { title: "Size" };

export default async function VariantPage({ params }: PageProps<"/products/[productId]/variants/[variantId]">) {
  await requireAdmin();
  const { productId, variantId } = await params;
  const [{ product, listings }, settings] = await Promise.all([getProductWithListings(productId), getPublicSettings()]);
  if (!product.variants.some((variant) => variant.id === variantId)) notFound();

  return (
    <VariantEditor
      key={editorRevision(product, listings)}
      product={product}
      listings={listings}
      variantId={variantId}
      currency={settings.currency}
      timezone={settings.timezone}
    />
  );
}
