import type { CatalogProductDetail, CatalogVariant } from "./types";

export type ProductOptions = NonNullable<CatalogProductDetail["options"]>;

/** The option values a variant has, by option axis; undefined if unset. */
export function choices(options: ProductOptions, variant: CatalogVariant): (string | undefined)[] {
  const optionValueIds = variant.optionValueIds ?? [];
  return options.map((option) => option.values.find((val) => optionValueIds.includes(val.id))?.id);
}

/** Option values that appear in at least one variant. */
export function sellableValues(
  options: ProductOptions,
  variants: CatalogVariant[],
  optionIndex: number,
) {
  const option = options[optionIndex];
  if (!option) return [];
  return option.values.filter((val) =>
    variants.some((variant) => (variant.optionValueIds ?? []).includes(val.id)),
  );
}

/** Variant with exact current choices, except for the specified axis. */
export function exactVariant(
  options: ProductOptions,
  variants: CatalogVariant[],
  current: CatalogVariant,
  optionIndex: number,
  valueId: string,
): CatalogVariant | undefined {
  const wanted = choices(options, current).map((choice, index) => (index === optionIndex ? valueId : choice));
  return variants.find((variant) => choices(options, variant).every((choice, index) => choice === wanted[index]));
}

/** Pick best variant keeping as many current choices as possible. */
export function pickVariant(
  options: ProductOptions,
  variants: CatalogVariant[],
  current: CatalogVariant,
  optionIndex: number,
  valueId: string,
): CatalogVariant | undefined {
  const wanted = choices(options, current).map((choice, index) => (index === optionIndex ? valueId : choice));
  const score = (variant: CatalogVariant) =>
    choices(options, variant).filter((choice, index) => choice === wanted[index]).length * 2 + (variant.inStock ? 1 : 0);
  return variants
    .filter((variant) => (variant.optionValueIds ?? []).includes(valueId))
    .reduce<CatalogVariant | undefined>((best, variant) => (!best || score(variant) > score(best) ? variant : best), undefined);
}

/** Resolves initial variant matching query params (e.g. ?variant=... or ?size=S&colour=Vintage+White) */
export function findVariantFromParams(
  variants: CatalogVariant[],
  options: ProductOptions | undefined,
  params: Record<string, string | string[] | undefined>,
): CatalogVariant | undefined {
  // 1. Direct variantId match
  const variantParam = params.variant ?? params.v;
  if (variantParam) {
    const vId = Array.isArray(variantParam) ? variantParam[0] : variantParam;
    const direct = variants.find((v) => v.variantId === vId);
    if (direct) return direct;
  }

  // 2. Option axes match (e.g. ?size=S&colour=Vintage+White)
  if (options && options.length > 0) {
    const hasAnyOptionParam = options.some((opt) => {
      const val = params[opt.name.toLowerCase()] ?? params[opt.name];
      return Boolean(val);
    });

    if (hasAnyOptionParam) {
      const matched = variants.find((v) => {
        const vChoices = choices(options, v);
        return options.every((opt, idx) => {
          const raw = params[opt.name.toLowerCase()] ?? params[opt.name];
          if (!raw) return true;
          const targetVal = (Array.isArray(raw) ? raw[0] : raw).trim().toLowerCase();
          const actualChoiceId = vChoices[idx];
          const actualVal = opt.values.find((val) => val.id === actualChoiceId);
          return actualVal?.value.trim().toLowerCase() === targetVal;
        });
      });
      if (matched) return matched;
    }
  }

  return undefined;
}

/** Builds URL search params representing the chosen variant / options */
export function variantToSearchParams(
  options: ProductOptions | undefined,
  variant: CatalogVariant,
): Record<string, string> {
  const params: Record<string, string> = {};
  if (options && options.length > 0) {
    const vChoices = choices(options, variant);
    options.forEach((opt, idx) => {
      const valId = vChoices[idx];
      const val = opt.values.find((v) => v.id === valId);
      if (val) {
        params[opt.name.toLowerCase()] = val.value;
      }
    });
  } else {
    params.variant = variant.variantId;
  }
  return params;
}
