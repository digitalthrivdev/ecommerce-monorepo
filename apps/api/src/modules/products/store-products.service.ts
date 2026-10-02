import { Prisma, StoreStatus, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import {
  brandSummarySelect,
  categorySummarySelect,
  customerVisibleProduct,
  imageOrder,
  imageSelect,
  imagesFor,
  inCategory,
  maxOrderQuantity,
  productSearch,
  variantLabel,
} from "./catalog.js";
import type {
  CreateStoreVariantInput,
  ListStoreProductsQuery,
  UpdateStoreVariantInput,
} from "./products.schemas.js";

/** A listing customers can buy: offered by the store, of an active variant of a visible product. */
export const customerVisible = {
  isAvailable: true,
  variant: { isActive: true, product: customerVisibleProduct },
} satisfies Prisma.StoreProductWhereInput;

/**
 * Which of a product's variants to show at a store. Customers see variants the store offers;
 * managers also see listings that are switched off and inactive variants.
 */
function variantFilter(storeId: string, canManage: boolean): Prisma.ProductVariantWhereInput {
  return canManage
    ? { stores: { some: { storeId } } }
    : { isActive: true, stores: { some: { storeId, isAvailable: true } } };
}

function productInclude(storeId: string, canManage: boolean, options: { detail: boolean }) {
  return {
    category: { select: categorySummarySelect },
    brand: { select: brandSummarySelect },
    images: { orderBy: imageOrder, select: imageSelect },
    ...(options.detail && {
      options: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, values: { orderBy: { sortOrder: "asc" }, select: { id: true, value: true } } },
      },
    }),
    variants: {
      where: variantFilter(storeId, canManage),
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        optionValues: { select: { optionValueId: true } },
        stores: {
          where: { storeId },
          select: { id: true, sellingPrice: true, mrp: true, isAvailable: true, inventory: { select: { quantity: true } } },
        },
      },
    },
  } satisfies Prisma.ProductInclude;
}

type StoreProductRow = Prisma.ProductGetPayload<{ include: ReturnType<typeof productInclude> }>;
type StoreProductDetailRow = StoreProductRow & {
  options: { id: string; name: string; values: { id: string; value: string }[] }[];
};

function toVariantView(row: StoreProductRow, variant: StoreProductRow["variants"][number], options: { includeStock: boolean; detail: boolean }) {
  const listing = variant.stores[0]!;
  const stockQuantity = listing.inventory?.quantity ?? 0;
  const images = imagesFor(row.images, variant.id);

  return {
    variantId: variant.id,
    storeProductId: listing.id,
    label: variantLabel(variant),
    name: variant.name,
    unit: variant.unit,
    quantity: variant.quantity?.toString() ?? null,
    imageUrl: images[0]?.url ?? null,
    sellingPrice: listing.sellingPrice.toFixed(2),
    mrp: listing.mrp?.toFixed(2) ?? null,
    inStock: stockQuantity > 0,
    maxOrderQuantity: maxOrderQuantity(variant),
    ...(options.detail && { optionValueIds: variant.optionValues.map((link) => link.optionValueId) }),
    ...(options.includeStock && {
      sku: variant.sku,
      isAvailable: listing.isAvailable,
      variantIsActive: variant.isActive,
      stockQuantity,
    }),
  };
}

/** A product as sold at one store: one entry per variant the store lists. */
export function toStoreProductView(row: StoreProductRow, options: { includeStock: boolean }) {
  return {
    productId: row.id,
    name: row.name,
    slug: row.slug,
    category: row.category,
    brand: row.brand,
    isVeg: row.isVeg,
    imageUrl: row.images.find((image) => image.variantId === null)?.url ?? row.images[0]?.url ?? null,
    variants: row.variants.map((variant) => toVariantView(row, variant, { ...options, detail: false })),
    ...(options.includeStock && { productIsActive: row.isActive }),
  };
}

function toStoreProductDetail(row: StoreProductDetailRow, options: { includeStock: boolean }) {
  return {
    productId: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    category: row.category,
    brand: row.brand,
    isVeg: row.isVeg,
    manufacturerName: row.manufacturerName,
    manufacturerAddress: row.manufacturerAddress,
    countryOfOrigin: row.countryOfOrigin,
    fssaiLicense: row.fssaiLicense,
    shelfLife: row.shelfLife,
    ingredients: row.ingredients,
    images: row.images,
    options: row.options,
    variants: row.variants.map((variant) => toVariantView(row, variant, { ...options, detail: true })),
    ...(options.includeStock && { productIsActive: row.isActive }),
  };
}

/** Listings of one store that customers can see, for queries on products. */
export function storeProductWhere(storeId: string, canManage: boolean): Prisma.ProductWhereInput {
  return canManage
    ? { variants: { some: variantFilter(storeId, true) } }
    : { ...customerVisibleProduct, variants: { some: variantFilter(storeId, false) } };
}

export function storeProductInclude(storeId: string) {
  return productInclude(storeId, false, { detail: false });
}

type DecimalInput = string | Prisma.Decimal;

function assertMrpNotBelowPrice(sellingPrice: DecimalInput, mrp: DecimalInput | null) {
  if (mrp !== null && new Prisma.Decimal(mrp).lt(sellingPrice)) {
    throw new AppError(400, "INVALID_PRICE", "MRP cannot be lower than the selling price");
  }
}

export function createStoreProductsService(prisma: PrismaClient) {
  async function assertStore(storeId: string, options: { includeInactive: boolean }) {
    const store = await prisma.store.findFirst({
      where: options.includeInactive ? { id: storeId } : { id: storeId, status: StoreStatus.ACTIVE },
      select: { id: true },
    });

    if (!store) {
      throw new AppError(404, "STORE_NOT_FOUND", "Store not found");
    }
  }

  async function listStoreProducts(
    storeId: string,
    { limit, offset, categoryId, brandId, search, includeUnavailable }: ListStoreProductsQuery,
    options: { canManage: boolean },
  ) {
    await assertStore(storeId, { includeInactive: options.canManage });

    const manage = options.canManage && includeUnavailable;
    const where: Prisma.ProductWhereInput = {
      ...storeProductWhere(storeId, manage),
      ...(brandId && { brandId }),
      AND: [categoryId ? inCategory(categoryId) : {}, search ? productSearch(search, { matchCodes: options.canManage }) : {}],
    };

    const [rows, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        include: productInclude(storeId, manage, { detail: false }),
        orderBy: { name: "asc" },
        take: limit,
        skip: offset,
      }),
      prisma.product.count({ where }),
    ]);

    return {
      items: rows.map((row) => toStoreProductView(row, { includeStock: options.canManage })),
      total,
      limit,
      offset,
    };
  }

  async function getStoreProduct(storeId: string, productId: string, options: { canManage: boolean }) {
    await assertStore(storeId, { includeInactive: options.canManage });

    const product = await prisma.product.findFirst({
      where: { id: productId, ...storeProductWhere(storeId, options.canManage) },
      include: productInclude(storeId, options.canManage, { detail: true }),
    });

    if (!product) {
      throw new AppError(404, "PRODUCT_NOT_AVAILABLE", "Product is not available at this store");
    }

    return toStoreProductDetail(product as StoreProductDetailRow, { includeStock: options.canManage });
  }

  /** For every store, each variant's listing there, or null where it is not listed (admin view). */
  async function listProductListings(productId: string) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        variants: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: { id: true, sku: true, name: true, unit: true, quantity: true, isActive: true },
        },
      },
    });

    if (!product) {
      throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
    }

    const [stores, listings] = await prisma.$transaction([
      prisma.store.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, code: true, status: true },
      }),
      prisma.storeProduct.findMany({
        where: { variant: { productId } },
        select: {
          id: true,
          storeId: true,
          variantId: true,
          sellingPrice: true,
          mrp: true,
          isAvailable: true,
          inventory: { select: { quantity: true } },
        },
      }),
    ]);

    const byKey = new Map(listings.map((listing) => [`${listing.storeId}:${listing.variantId}`, listing]));

    return {
      variants: product.variants.map(({ quantity, ...variant }) => ({
        ...variant,
        quantity: quantity?.toString() ?? null,
        label: variantLabel({ ...variant, quantity }),
      })),
      items: stores.map((store) => ({
        store,
        listings: product.variants.map((variant) => {
          const listing = byKey.get(`${store.id}:${variant.id}`);
          return {
            variantId: variant.id,
            listing: listing
              ? {
                  storeProductId: listing.id,
                  sellingPrice: listing.sellingPrice.toFixed(2),
                  mrp: listing.mrp?.toFixed(2) ?? null,
                  isAvailable: listing.isAvailable,
                  stockQuantity: listing.inventory?.quantity ?? 0,
                }
              : null,
          };
        }),
      })),
    };
  }

  async function getListing(storeId: string, variantId: string) {
    const listing = await prisma.storeProduct.findUniqueOrThrow({
      where: { storeId_variantId: { storeId, variantId } },
      select: {
        id: true,
        storeId: true,
        variantId: true,
        sellingPrice: true,
        mrp: true,
        isAvailable: true,
        inventory: { select: { quantity: true } },
      },
    });

    return {
      storeProductId: listing.id,
      storeId: listing.storeId,
      variantId: listing.variantId,
      sellingPrice: listing.sellingPrice.toFixed(2),
      mrp: listing.mrp?.toFixed(2) ?? null,
      isAvailable: listing.isAvailable,
      stockQuantity: listing.inventory?.quantity ?? 0,
    };
  }

  async function createStoreVariant(storeId: string, data: CreateStoreVariantInput) {
    await assertStore(storeId, { includeInactive: true });

    const variant = await prisma.productVariant.findUnique({ where: { id: data.variantId }, select: { id: true } });

    if (!variant) {
      throw new AppError(400, "INVALID_VARIANT", "Variant does not exist");
    }

    assertMrpNotBelowPrice(data.sellingPrice, data.mrp ?? null);

    const existing = await prisma.storeProduct.findUnique({
      where: { storeId_variantId: { storeId, variantId: data.variantId } },
      select: { id: true },
    });
    if (existing) {
      throw new AppError(409, "ALREADY_LISTED", "This variant is already listed at the store");
    }

    await prisma.storeProduct.create({
      data: {
        storeId,
        variantId: data.variantId,
        sellingPrice: data.sellingPrice,
        mrp: data.mrp,
        isAvailable: data.isAvailable,
        inventory: { create: { quantity: 0 } },
      },
    });

    return getListing(storeId, data.variantId);
  }

  async function updateStoreVariant(storeId: string, variantId: string, data: UpdateStoreVariantInput) {
    const existing = await prisma.storeProduct.findUnique({
      where: { storeId_variantId: { storeId, variantId } },
      select: { id: true, sellingPrice: true, mrp: true },
    });

    if (!existing) {
      throw new AppError(404, "STORE_PRODUCT_NOT_FOUND", "Variant is not listed at this store");
    }

    assertMrpNotBelowPrice(
      data.sellingPrice ?? existing.sellingPrice,
      data.mrp === undefined ? existing.mrp : data.mrp,
    );

    await prisma.storeProduct.update({ where: { id: existing.id }, data });

    return getListing(storeId, variantId);
  }

  return {
    listStoreProducts,
    getStoreProduct,
    listProductListings,
    createStoreVariant,
    updateStoreVariant,
  };
}
