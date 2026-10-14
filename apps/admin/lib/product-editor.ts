import type { ProductDetail, ProductSpecification } from "./types";
import { COPIED_FIELDS, type Draft, type VariantDraft } from "./variant-drafts";

export const MAX_SPECIFICATIONS = 30;

/** Text fields of the product form, as typed. */
export type DetailsDraft = {
  name: string;
  description: string;
  categoryId: string;
  brandId: string;
  tags: string;
  gstRate: string;
  hsnCode: string;
  manufacturerName: string;
  manufacturerAddress: string;
  countryOfOrigin: string;
  specifications: ProductSpecification[];
  slug: string;
  isActive: boolean;
};

export const NONE = "none";

export function detailsFromProduct(product?: ProductDetail): DetailsDraft {
  return {
    name: product?.name ?? "",
    description: product?.description ?? "",
    categoryId: product?.categoryId ?? "",
    brandId: product?.brandId ?? NONE,
    tags: product?.tags.join(", ") ?? "",
    gstRate: product?.gstRate ? Number(product.gstRate).toString() : "",
    hsnCode: product?.hsnCode ?? "",
    manufacturerName: product?.manufacturerName ?? "",
    manufacturerAddress: product?.manufacturerAddress ?? "",
    countryOfOrigin: product?.countryOfOrigin ?? "",
    specifications: product?.specifications ?? [],
    slug: product?.slug ?? "",
    isActive: product?.isActive ?? true,
  };
}

/** The size sharing the most option values with `target`, earliest first on a tie. */
export function closestVariant(draft: Draft, target: VariantDraft, eligible: (variant: VariantDraft) => boolean) {
  let best: VariantDraft | undefined;
  let bestScore = -1;
  for (const variant of draft.variants) {
    if (variant.key === target.key || !eligible(variant)) continue;
    const score = draft.options.filter((option) => variant.values[option.key] === target.values[option.key]).length;
    if (score > bestScore) {
      best = variant;
      bestScore = score;
    }
  }
  return best;
}

/** Sizes added since `previous` start with the price and parcel details of the closest existing size. */
export function fillNewVariants(previous: Draft, next: Draft): Draft {
  const known = new Set(previous.variants.map((variant) => variant.key));
  if (next.variants.every((variant) => known.has(variant.key))) return next;
  return {
    ...next,
    variants: next.variants.map((variant) => {
      if (known.has(variant.key)) return variant;
      const source = closestVariant(next, variant, (candidate) => known.has(candidate.key));
      if (!source) return variant;
      return { ...variant, ...Object.fromEntries(COPIED_FIELDS.map((field) => [field, source[field]])) };
    }),
  };
}
