import { DECIMAL_PATTERN } from "@shop/validation";

import type { ProductDetail } from "./types";

export const MAX_OPTIONS = 3;
export const MAX_OPTION_VALUES = 30;
export const MAX_VARIANTS = 100;
const MAX_WEIGHT_GRAMS = 1_000_000;
const MAX_DIMENSION_CM = 10_000;

export type OptionDraft = { key: string; name: string; values: string[] };

export type VariantDraft = {
  key: string;
  id?: string;
  /** Option key → value. */
  values: Record<string, string>;
  sku: string;
  barcode: string;
  quantity: string;
  unit: string;
  maxOrderQuantity: string;
  price: string;
  compareAtPrice: string;
  weightGrams: string;
  lengthCm: string;
  breadthCm: string;
  heightCm: string;
  isActive: boolean;
};

/** Price and parcel fields a new size copies from the closest one. */
export const COPIED_FIELDS = ["price", "compareAtPrice", "weightGrams", "lengthCm", "breadthCm", "heightCm"] as const;

export type Draft = { options: OptionDraft[]; variants: VariantDraft[] };

/** Body of PUT /products/:id/variants. */
export type VariantsPayload = {
  options: Array<{ name: string; values: string[] }>;
  variants: Array<{
    id?: string;
    sku: string;
    barcode: string | null;
    unit: string | null;
    quantity: string | null;
    maxOrderQuantity: number | null;
    price: string;
    compareAtPrice: string | null;
    weightGrams: number | null;
    lengthCm: string | null;
    breadthCm: string | null;
    heightCm: string | null;
    isActive: boolean;
    optionValues: string[];
  }>;
};

let nextKey = 0;
const newKey = () => `new-${++nextKey}`;

const comboKey = (options: OptionDraft[], values: Record<string, string>) =>
  options.map((option) => values[option.key]?.toLowerCase() ?? "").join("\u0000");

/** Every combination of the options' values, as option key → value maps. */
function combinations(options: OptionDraft[]): Record<string, string>[] {
  return options.reduce<Record<string, string>[]>(
    (combos, option) => combos.flatMap((combo) => option.values.map((value) => ({ ...combo, [option.key]: value }))),
    [{}],
  );
}

export function suggestSku(slug: string, values: string[]) {
  return [slug, ...values]
    .join("-")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function newVariant(values: Record<string, string>, options: OptionDraft[], slug: string): VariantDraft {
  return {
    key: newKey(),
    values,
    sku: suggestSku(slug, options.map((option) => values[option.key] ?? "")),
    barcode: "",
    quantity: "",
    unit: "",
    maxOrderQuantity: "",
    price: "",
    compareAtPrice: "",
    weightGrams: "",
    lengthCm: "",
    breadthCm: "",
    heightCm: "",
    isActive: true,
  };
}

const decimalText = (value: string | null) => (value ? Number(value).toString() : "");

export function draftFromProduct(product: Pick<ProductDetail, "options" | "variants">): Draft {
  const options: OptionDraft[] = product.options.map((option) => ({
    key: option.id,
    name: option.name,
    values: option.values.map((value) => value.value),
  }));
  const variants: VariantDraft[] = product.variants.map((variant) => ({
    key: variant.id,
    id: variant.id,
    values: Object.fromEntries(options.map((option, index) => [option.key, variant.optionValues[index] ?? ""])),
    sku: variant.sku,
    barcode: variant.barcode ?? "",
    quantity: variant.quantity ? Number(variant.quantity).toString() : "",
    unit: variant.unit ?? "",
    maxOrderQuantity: variant.maxOrderQuantity?.toString() ?? "",
    price: decimalText(variant.price),
    compareAtPrice: decimalText(variant.compareAtPrice),
    weightGrams: variant.weightGrams?.toString() ?? "",
    lengthCm: decimalText(variant.lengthCm),
    breadthCm: decimalText(variant.breadthCm),
    heightCm: decimalText(variant.heightCm),
    isActive: variant.isActive,
  }));
  return { options, variants };
}

export function toPayload({ options, variants }: Draft): VariantsPayload {
  return {
    options: options.map((option) => ({ name: option.name.trim(), values: option.values })),
    variants: variants.map((variant) => ({
      ...(variant.id && { id: variant.id }),
      sku: variant.sku.trim().toUpperCase(),
      barcode: variant.barcode.trim() || null,
      quantity: variant.quantity.trim() || null,
      unit: variant.unit.trim() || null,
      maxOrderQuantity: variant.maxOrderQuantity.trim() ? Number(variant.maxOrderQuantity) : null,
      price: variant.price.trim(),
      compareAtPrice: variant.compareAtPrice.trim() || null,
      weightGrams: variant.weightGrams.trim() ? Number(variant.weightGrams) : null,
      lengthCm: variant.lengthCm.trim() || null,
      breadthCm: variant.breadthCm.trim() || null,
      heightCm: variant.heightCm.trim() || null,
      isActive: variant.isActive,
      optionValues: options.map((option) => variant.values[option.key] ?? ""),
    })),
  };
}

const isPositiveDecimal = (value: string) => DECIMAL_PATTERN.test(value) && Number(value) > 0;

/** Problems with a size's price and parcel fields, keyed by field name. */
export function variantFieldProblems(variant: Pick<VariantDraft, (typeof COPIED_FIELDS)[number]>) {
  const problems: Record<string, string> = {};
  const price = variant.price.trim();
  const compareAt = variant.compareAtPrice.trim();
  const weight = variant.weightGrams.trim();
  if (!isPositiveDecimal(price)) problems.price = "Enter a price like 499 or 499.50";
  if (compareAt && !isPositiveDecimal(compareAt)) problems.compareAtPrice = "Enter a price like 699, or leave it empty";
  else if (compareAt && isPositiveDecimal(price) && Number(compareAt) < Number(price)) {
    problems.compareAtPrice = "The compare-at price can't be lower than the price";
  }
  if (weight && !(/^\d+$/.test(weight) && Number(weight) >= 1 && Number(weight) <= MAX_WEIGHT_GRAMS)) {
    problems.weightGrams = "Enter the weight in whole grams, or leave it empty";
  }
  for (const field of ["lengthCm", "breadthCm", "heightCm"] as const) {
    const value = variant[field].trim();
    if (value && !(isPositiveDecimal(value) && Number(value) <= MAX_DIMENSION_CM)) {
      problems[field] = `Enter centimetres up to ${MAX_DIMENSION_CM}, or leave it empty`;
    }
  }
  return problems;
}

/** Problems of every size, keyed `variants.<index>.<field>` like the API's. */
export function variantsProblems(draft: Draft) {
  const problems: Record<string, string> = {};
  draft.variants.forEach((variant, index) => {
    for (const [field, message] of Object.entries(variantFieldProblems(variant))) problems[`variants.${index}.${field}`] = message;
  });
  return problems;
}

export const variantLabel = (options: OptionDraft[], variant: VariantDraft) =>
  options.map((option) => variant.values[option.key]).join(" · ");

/** Results are a new draft, or an error message to show. */
type Result = Draft | string;

const checkSize = (draft: Draft): Result =>
  draft.variants.length > MAX_VARIANTS ? `A product can have at most ${MAX_VARIANTS} sizes` : draft;

/** Adds a value and a variant for each new combination it makes. */
export function addOptionValue(draft: Draft, optionKey: string, value: string, slug: string): Result {
  const option = draft.options.find((candidate) => candidate.key === optionKey);
  if (!option) return "Unknown option";
  if (option.values.length >= MAX_OPTION_VALUES) return `An option can have at most ${MAX_OPTION_VALUES} values`;
  if (option.values.some((existing) => existing.toLowerCase() === value.toLowerCase())) {
    return `${option.name} already has “${value}”`;
  }

  const options = draft.options.map((candidate) =>
    candidate.key === optionKey ? { ...candidate, values: [...candidate.values, value] } : candidate,
  );
  const others = combinations(options.filter((candidate) => candidate.key !== optionKey));
  const added = others.map((combo) => newVariant({ ...combo, [optionKey]: value }, options, slug));
  return checkSize({ options, variants: [...draft.variants, ...added] });
}

/** Removes a value and every variant that uses it. An option keeps at least one value. */
export function removeOptionValue(draft: Draft, optionKey: string, value: string): Result {
  const option = draft.options.find((candidate) => candidate.key === optionKey);
  if (!option || option.values.length <= 1) return "An option needs at least one value; remove the option instead";
  const variants = draft.variants.filter((variant) => variant.values[optionKey] !== value);
  if (variants.length === 0) return "A product needs at least one size";
  return {
    options: draft.options.map((candidate) =>
      candidate.key === optionKey ? { ...candidate, values: candidate.values.filter((existing) => existing !== value) } : candidate,
    ),
    variants,
  };
}

/** Adds an option; existing variants get its first value. */
export function addOption(draft: Draft, name: string, value: string): Result {
  if (draft.options.length >= MAX_OPTIONS) return `A product can have at most ${MAX_OPTIONS} options`;
  if (draft.options.some((option) => option.name.toLowerCase() === name.toLowerCase())) {
    return `There is already an option called ${name}`;
  }
  const key = newKey();
  return {
    options: [...draft.options, { key, name, values: [value] }],
    variants: draft.variants.map((variant) => ({ ...variant, values: { ...variant.values, [key]: value } })),
  };
}

/** Removes an option. Variants that become identical keep one, preferring a saved variant. */
export function removeOption(draft: Draft, optionKey: string): Draft {
  const options = draft.options.filter((option) => option.key !== optionKey);
  const stripped = draft.variants.map((variant) => {
    const values = { ...variant.values };
    delete values[optionKey];
    return { ...variant, values };
  });
  const chosen = new Map<string, VariantDraft>();
  for (const variant of stripped) {
    const key = comboKey(options, variant.values);
    const current = chosen.get(key);
    if (!current || (!current.id && variant.id)) chosen.set(key, variant);
  }
  const keep = new Set(chosen.values());
  return { options, variants: stripped.filter((variant) => keep.has(variant)) };
}

export function missingCombinations({ options, variants }: Draft) {
  if (options.length === 0) return [];
  const existing = new Set(variants.map((variant) => comboKey(options, variant.values)));
  return combinations(options).filter((combo) => !existing.has(comboKey(options, combo)));
}

export function addMissingCombinations(draft: Draft, slug: string): Result {
  const added = missingCombinations(draft).map((combo) => newVariant(combo, draft.options, slug));
  return checkSize({ ...draft, variants: [...draft.variants, ...added] });
}

export function removeVariant(draft: Draft, key: string): Result {
  if (draft.variants.length <= 1) return "A product needs at least one size";
  return { ...draft, variants: draft.variants.filter((variant) => variant.key !== key) };
}
