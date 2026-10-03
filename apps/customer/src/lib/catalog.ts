import type { Category, ProductImage, StoreProduct, StoreProductDetail, StoreVariant } from "./types";

type DetailVariant = StoreProductDetail["variants"][number];

/** The variant a product opens on: the first one in stock, else the first listed. */
export function defaultVariant<T extends StoreVariant>(variants: T[]): T | undefined {
  return variants.find((variant) => variant.inStock) ?? variants[0];
}

/** A variant's own photos first, then the ones shared by every variant. */
export function imagesFor(images: ProductImage[], variantId: string | undefined) {
  return [...images.filter((image) => image.variantId !== null && image.variantId === variantId), ...images.filter((image) => image.variantId === null)];
}

/** Details from a list item, shown while the full product loads. Options appear once it has. */
export function detailPlaceholder(product: StoreProduct): StoreProductDetail {
  const shared: ProductImage[] = product.imageUrl ? [{ id: "placeholder", url: product.imageUrl, altText: null, variantId: null }] : [];
  const own = product.variants
    .filter((variant) => variant.imageUrl && variant.imageUrl !== product.imageUrl)
    .map((variant) => ({ id: `placeholder:${variant.variantId}`, url: variant.imageUrl!, altText: null, variantId: variant.variantId }));

  return {
    ...product,
    description: null,
    manufacturerName: null,
    manufacturerAddress: null,
    countryOfOrigin: null,
    fssaiLicense: null,
    shelfLife: null,
    ingredients: null,
    images: [...own, ...shared],
    options: [],
    variants: product.variants.map((variant) => ({ ...variant, optionValueIds: [] })),
  };
}

/** The option values a variant has, by option; undefined for options it doesn't set. */
function choices(product: StoreProductDetail, variant: DetailVariant) {
  return product.options.map((option) => option.values.find((value) => variant.optionValueIds.includes(value.id))?.id);
}

/** Option values the store sells at least one variant of; the rest are hidden. */
export function sellableValues(product: StoreProductDetail, optionIndex: number) {
  return product.options[optionIndex]!.values.filter((value) => product.variants.some((variant) => variant.optionValueIds.includes(value.id)));
}

/** The variant with exactly `current`'s other choices and `valueId` for this option, if the store sells it. */
export function exactVariant(product: StoreProductDetail, current: DetailVariant, optionIndex: number, valueId: string) {
  const wanted = choices(product, current).map((choice, index) => (index === optionIndex ? valueId : choice));
  return product.variants.find((variant) => choices(product, variant).every((choice, index) => choice === wanted[index]));
}

/** The variant to show after picking `valueId`: keeps as many other choices as possible, preferring stock. */
export function pickVariant(product: StoreProductDetail, current: DetailVariant, optionIndex: number, valueId: string) {
  const wanted = choices(product, current).map((choice, index) => (index === optionIndex ? valueId : choice));
  const score = (variant: DetailVariant) =>
    choices(product, variant).filter((choice, index) => choice === wanted[index]).length * 2 + (variant.inStock ? 1 : 0);
  return product.variants
    .filter((variant) => variant.optionValueIds.includes(valueId))
    .reduce<DetailVariant | undefined>((best, variant) => (!best || score(variant) > score(best) ? variant : best), undefined);
}

export const topLevelCategories = (categories: Category[]) => categories.filter((category) => category.parentId === null);

export const subCategories = (categories: Category[], parentId: string) => categories.filter((category) => category.parentId === parentId);
