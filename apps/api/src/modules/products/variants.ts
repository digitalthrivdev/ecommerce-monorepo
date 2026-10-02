import type { Prisma } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import type { VariantsInput } from "./products.schemas.js";

type Tx = Prisma.TransactionClient;

const key = (value: string) => value.toLowerCase();

function findDuplicate(values: string[]) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(key(value))) return value;
    seen.add(key(value));
  }
  return undefined;
}

/**
 * Checks the options and variants and returns, per variant, its option values spelled as in `options`.
 * Every variant needs one value of every option, and no two variants may share a combination.
 */
function validate({ options, variants }: VariantsInput) {
  const duplicateOption = findDuplicate(options.map((option) => option.name));
  if (duplicateOption) {
    throw new AppError(400, "DUPLICATE_OPTION", `Option "${duplicateOption}" is listed twice`);
  }

  for (const option of options) {
    const duplicateValue = findDuplicate(option.values);
    if (duplicateValue) {
      throw new AppError(400, "DUPLICATE_OPTION_VALUE", `"${duplicateValue}" is listed twice under ${option.name}`);
    }
  }

  if (options.length === 0 && variants.length !== 1) {
    throw new AppError(400, "OPTIONS_REQUIRED", "A product without options has exactly one variant. Add an option such as Size.");
  }

  const duplicateSku = findDuplicate(variants.map((variant) => variant.sku));
  if (duplicateSku) {
    throw new AppError(400, "DUPLICATE_SKU", `SKU ${duplicateSku} is used by more than one variant`);
  }

  const ids = variants.flatMap((variant) => variant.id ?? []);
  if (new Set(ids).size !== ids.length) {
    throw new AppError(400, "DUPLICATE_VARIANT", "A variant is listed twice");
  }

  const combinations = new Set<string>();

  return variants.map((variant) => {
    if (variant.optionValues.length !== options.length) {
      throw new AppError(400, "INVALID_VARIANT_OPTIONS", `Variant ${variant.sku} needs exactly one value for each option`);
    }

    const values = variant.optionValues.map((value, index) => {
      const option = options[index]!;
      const canonical = option.values.find((candidate) => key(candidate) === key(value));
      if (!canonical) {
        throw new AppError(400, "INVALID_VARIANT_OPTIONS", `"${value}" is not a value of ${option.name}`);
      }
      return canonical;
    });

    const combination = values.map(key).join("\u0000");
    if (combinations.has(combination)) {
      throw new AppError(400, "DUPLICATE_VARIANT", `Two variants are both ${values.join(" · ")}`);
    }
    combinations.add(combination);

    return values;
  });
}

/** Deletes variants that were never ordered, with their store listings, stock and cart items. */
async function deleteVariants(tx: Tx, variantIds: string[]) {
  if (variantIds.length === 0) return;

  const listings = await tx.storeProduct.findMany({ where: { variantId: { in: variantIds } }, select: { id: true } });
  const listingIds = listings.map((listing) => listing.id);

  await tx.cartItem.deleteMany({ where: { variantId: { in: variantIds } } });
  await tx.inventoryAdjustment.deleteMany({ where: { storeProductId: { in: listingIds } } });
  await tx.inventory.deleteMany({ where: { storeProductId: { in: listingIds } } });
  await tx.storeProduct.deleteMany({ where: { id: { in: listingIds } } });
  await tx.productVariant.deleteMany({ where: { id: { in: variantIds } } });
}

/**
 * Replaces a product's options and variants with the given set. Listed variants with an id are
 * updated, the others created; variants left out are deleted, which is refused for ordered ones.
 * Must run inside a transaction.
 */
export async function saveVariants(tx: Tx, productId: string, input: VariantsInput) {
  const valuesByVariant = validate(input);

  const existing = await tx.productVariant.findMany({
    where: { productId },
    select: { id: true, sku: true, _count: { select: { orderItems: true } } },
  });
  const existingById = new Map(existing.map((variant) => [variant.id, variant]));

  const unknown = input.variants.filter((variant) => variant.id && !existingById.has(variant.id));
  if (unknown.length > 0) {
    throw new AppError(400, "VARIANT_NOT_FOUND", "A variant does not belong to this product", {
      variantIds: unknown.map((variant) => variant.id),
    });
  }

  const kept = new Set(input.variants.flatMap((variant) => variant.id ?? []));
  const removed = existing.filter((variant) => !kept.has(variant.id));
  const ordered = removed.filter((variant) => variant._count.orderItems > 0);
  if (ordered.length > 0) {
    throw new AppError(409, "VARIANT_HAS_ORDERS", "Variants that have been ordered cannot be removed. Deactivate them instead.", {
      variantIds: ordered.map((variant) => variant.id),
    });
  }

  const skus = input.variants.map((variant) => variant.sku);
  const taken = await tx.productVariant.findMany({
    where: { sku: { in: skus }, productId: { not: productId } },
    select: { sku: true },
  });
  if (taken.length > 0) {
    throw new AppError(409, "SKU_TAKEN", `SKU ${taken.map((variant) => variant.sku).join(", ")} is used by another product`, {
      skus: taken.map((variant) => variant.sku),
    });
  }

  await deleteVariants(tx, removed.map((variant) => variant.id));

  // Variants may swap SKUs, so changed SKUs are first moved aside. SKUs are upper case and ids are
  // lower case, so an id never clashes with a real SKU.
  for (const variant of input.variants) {
    if (variant.id && existingById.get(variant.id)!.sku !== variant.sku) {
      await tx.productVariant.update({ where: { id: variant.id }, data: { sku: variant.id } });
    }
  }

  // Options are rebuilt; removing them also removes every variant's links to their values.
  await tx.productOption.deleteMany({ where: { productId } });
  const valueIds = new Map<string, string>();
  for (const [sortOrder, option] of input.options.entries()) {
    const created = await tx.productOption.create({
      data: {
        productId,
        name: option.name,
        sortOrder,
        values: { create: option.values.map((value, index) => ({ value, sortOrder: index })) },
      },
      select: { values: { select: { id: true, value: true } } },
    });
    for (const value of created.values) {
      valueIds.set(`${sortOrder}\u0000${value.value}`, value.id);
    }
  }

  for (const [sortOrder, variant] of input.variants.entries()) {
    const values = valuesByVariant[sortOrder]!;
    const data = {
      sku: variant.sku,
      barcode: variant.barcode ?? null,
      unit: variant.unit ?? null,
      quantity: variant.quantity ?? null,
      maxOrderQuantity: variant.maxOrderQuantity ?? null,
      name: values.join(" · "),
      sortOrder,
      optionValues: {
        create: values.map((value, index) => ({ optionValueId: valueIds.get(`${index}\u0000${value}`)! })),
      },
    };

    if (variant.id) {
      await tx.productVariant.update({
        where: { id: variant.id },
        data: { ...data, ...(variant.isActive !== undefined && { isActive: variant.isActive }) },
      });
    } else {
      await tx.productVariant.create({ data: { ...data, productId, isActive: variant.isActive ?? true } });
    }
  }
}
