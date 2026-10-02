import type { Prisma } from "../../generated/prisma/client";

/** Platform-wide cap on units of one item per order; a variant's maxOrderQuantity can lower it. */
export const MAX_QUANTITY_PER_ITEM = 50;

export function maxOrderQuantity(variant: { maxOrderQuantity: number | null }) {
  return Math.min(MAX_QUANTITY_PER_ITEM, variant.maxOrderQuantity ?? MAX_QUANTITY_PER_ITEM);
}

/** "1 L", "500 g", "6 pc"; null when the variant has no unit. */
export function packSize(variant: { quantity: Prisma.Decimal | null; unit: string | null }) {
  if (!variant.unit) return null;
  return variant.quantity ? `${variant.quantity.toString()} ${variant.unit}` : variant.unit;
}

/** How customers see a variant: its option values, or its pack size for a product without options. */
export function variantLabel(variant: { name: string; quantity: Prisma.Decimal | null; unit: string | null }) {
  return variant.name || packSize(variant) || "";
}

export const imageSelect = {
  id: true,
  url: true,
  altText: true,
  variantId: true,
} satisfies Prisma.ProductImageSelect;

export const imageOrder = [{ sortOrder: "asc" }, { createdAt: "asc" }] satisfies Prisma.ProductImageOrderByWithRelationInput[];

type Image = { variantId: string | null };

/** A variant's own images first, then the images shared by every variant. */
export function imagesFor<T extends Image>(images: T[], variantId: string) {
  return [...images.filter((image) => image.variantId === variantId), ...images.filter((image) => image.variantId === null)];
}

export const categorySummarySelect = {
  id: true,
  name: true,
  slug: true,
  parentId: true,
} satisfies Prisma.CategorySelect;

export const brandSummarySelect = { id: true, name: true, slug: true, logoUrl: true } satisfies Prisma.BrandSelect;

/** Active products whose category (and its parent, for a sub-category) is active. */
export const customerVisibleProduct = {
  isActive: true,
  category: { isActive: true, OR: [{ parentId: null }, { parent: { isActive: true } }] },
} satisfies Prisma.ProductWhereInput;

/** A category also matches the products of its sub-categories. */
export function inCategory(categoryId: string): Prisma.ProductWhereInput {
  return { OR: [{ categoryId }, { category: { parentId: categoryId } }] };
}

/** Name or brand containing the term, or a tag equal to it. With matchCodes, also a variant's SKU or barcode. */
export function productSearch(term: string, options: { matchCodes: boolean }): Prisma.ProductWhereInput {
  return {
    OR: [
      { name: { contains: term, mode: "insensitive" } },
      { brand: { name: { contains: term, mode: "insensitive" } } },
      { tags: { has: term.toLowerCase() } },
      ...(options.matchCodes
        ? [{ variants: { some: { OR: [{ sku: { equals: term, mode: "insensitive" as const } }, { barcode: term }] } } }]
        : []),
    ],
  };
}
