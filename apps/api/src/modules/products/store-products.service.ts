import { Prisma, StoreStatus, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import type {
  CreateStoreProductInput,
  ListStoreProductsQuery,
  UpdateStoreProductInput,
} from "./products.schemas.js";

const storeProductInclude = {
  product: {
    include: { category: { select: { id: true, name: true, slug: true } } },
  },
  inventory: { select: { quantity: true } },
} satisfies Prisma.StoreProductInclude;

type StoreProductWithRelations = Prisma.StoreProductGetPayload<{
  include: typeof storeProductInclude;
}>;

function toView(storeProduct: StoreProductWithRelations, options: { includeStock: boolean }) {
  const { product } = storeProduct;
  const stockQuantity = storeProduct.inventory?.quantity ?? 0;

  return {
    productId: product.id,
    storeProductId: storeProduct.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    imageUrl: product.imageUrl,
    unit: product.unit,
    quantity: product.quantity,
    category: product.category,
    sellingPrice: storeProduct.sellingPrice.toFixed(2),
    mrp: storeProduct.mrp?.toFixed(2) ?? null,
    isAvailable: storeProduct.isAvailable,
    inStock: stockQuantity > 0,
    ...(options.includeStock && {
      stockQuantity,
      productIsActive: product.isActive,
    }),
  };
}

type DecimalInput = string | Prisma.Decimal;

function assertMrpNotBelowPrice(sellingPrice: DecimalInput, mrp: DecimalInput | null) {
  if (mrp !== null && new Prisma.Decimal(mrp).lt(sellingPrice)) {
    throw new AppError(400, "INVALID_PRICE", "MRP cannot be lower than the selling price");
  }
}

const customerVisible = {
  isAvailable: true,
  product: { isActive: true, category: { isActive: true } },
} satisfies Prisma.StoreProductWhereInput;

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
    { limit, offset, categoryId, search, includeUnavailable }: ListStoreProductsQuery,
    options: { isAdmin: boolean },
  ) {
    await assertStore(storeId, { includeInactive: options.isAdmin });

    const productFilter: Prisma.ProductWhereInput = {
      ...(categoryId && { categoryId }),
      ...(search && { name: { contains: search, mode: "insensitive" } }),
    };

    const where: Prisma.StoreProductWhereInput = includeUnavailable
      ? { storeId, product: productFilter }
      : {
          storeId,
          ...customerVisible,
          product: { ...customerVisible.product, ...productFilter },
        };

    const [rows, total] = await prisma.$transaction([
      prisma.storeProduct.findMany({
        where,
        include: storeProductInclude,
        orderBy: { product: { name: "asc" } },
        take: limit,
        skip: offset,
      }),
      prisma.storeProduct.count({ where }),
    ]);

    return {
      items: rows.map((row) => toView(row, { includeStock: options.isAdmin })),
      total,
      limit,
      offset,
    };
  }

  async function getStoreProduct(storeId: string, productId: string, options: { isAdmin: boolean }) {
    await assertStore(storeId, { includeInactive: options.isAdmin });

    const storeProduct = await prisma.storeProduct.findFirst({
      where: options.isAdmin
        ? { storeId, productId }
        : { storeId, productId, ...customerVisible },
      include: storeProductInclude,
    });

    if (!storeProduct) {
      throw new AppError(404, "PRODUCT_NOT_AVAILABLE", "Product is not available at this store");
    }

    return toView(storeProduct, { includeStock: options.isAdmin });
  }

  async function createStoreProduct(storeId: string, data: CreateStoreProductInput) {
    await assertStore(storeId, { includeInactive: true });

    const product = await prisma.product.findUnique({
      where: { id: data.productId },
      select: { id: true },
    });

    if (!product) {
      throw new AppError(400, "INVALID_PRODUCT", "Product does not exist");
    }

    assertMrpNotBelowPrice(data.sellingPrice, data.mrp ?? null);

    const storeProduct = await prisma.storeProduct.create({
      data: {
        storeId,
        productId: data.productId,
        sellingPrice: data.sellingPrice,
        mrp: data.mrp,
        isAvailable: data.isAvailable,
        inventory: { create: { quantity: 0 } },
      },
      include: storeProductInclude,
    });

    return toView(storeProduct, { includeStock: true });
  }

  async function updateStoreProduct(storeId: string, productId: string, data: UpdateStoreProductInput) {
    const existing = await prisma.storeProduct.findUnique({
      where: { storeId_productId: { storeId, productId } },
      select: { id: true, sellingPrice: true, mrp: true },
    });

    if (!existing) {
      throw new AppError(404, "STORE_PRODUCT_NOT_FOUND", "Product is not listed at this store");
    }

    assertMrpNotBelowPrice(
      data.sellingPrice ?? existing.sellingPrice,
      data.mrp === undefined ? existing.mrp : data.mrp,
    );

    const storeProduct = await prisma.storeProduct.update({
      where: { id: existing.id },
      data,
      include: storeProductInclude,
    });

    return toView(storeProduct, { includeStock: true });
  }

  return { listStoreProducts, getStoreProduct, createStoreProduct, updateStoreProduct };
}
