import { Prisma, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { slugify } from "../../shared/schemas.js";
import { featuredProductIds } from "../settings/appearance.service.js";
import {
  brandSummarySelect,
  categorySummarySelect,
  customerVisibleProduct,
  customerVisibleVariant,
  imageOrder,
  imageSelect,
  inCategory,
  productSearch,
  variantLabel,
} from "./catalog.js";
import {
  MAX_IMAGES,
  compareAtPriceProblem,
  type AddImageInput,
  type CreateProductInput,
  type ListProductsQuery,
  type UpdateImageInput,
  type UpdateProductInput,
  type UpdateVariantInput,
  type VariantsInput,
} from "./products.schemas.js";
import { deleteVariants, saveVariants } from "./variants.js";

const detailInclude = {
  category: { select: categorySummarySelect },
  brand: { select: brandSummarySelect },
  options: {
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, values: { orderBy: { sortOrder: "asc" }, select: { id: true, value: true } } },
  },
  variants: {
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { optionValues: { select: { optionValueId: true } }, inventory: { select: { quantity: true } } },
  },
  images: { orderBy: imageOrder, select: imageSelect },
} satisfies Prisma.ProductInclude;

type ProductDetail = Prisma.ProductGetPayload<{ include: typeof detailInclude }>;

const decimalText = (value: Prisma.Decimal | null) => value?.toString() ?? null;

/** A product as the dashboard edits it, with every variant's price and stock. Variant option values follow the order of `options`. */
export function toProductDetail({ options, variants, gstRate, ...product }: ProductDetail) {
  return {
    ...product,
    gstRate: gstRate?.toFixed(2) ?? null,
    options,
    variants: variants.map(({ optionValues, inventory, quantity, price, compareAtPrice, lengthCm, breadthCm, heightCm, ...variant }) => {
      const valueIds = new Set(optionValues.map((link) => link.optionValueId));
      return {
        ...variant,
        quantity: decimalText(quantity),
        label: variantLabel({ ...variant, quantity }),
        price: price.toFixed(2),
        compareAtPrice: compareAtPrice?.toFixed(2) ?? null,
        lengthCm: decimalText(lengthCm),
        breadthCm: decimalText(breadthCm),
        heightCm: decimalText(heightCm),
        stockQuantity: inventory?.quantity ?? 0,
        optionValues: options.map((option) => option.values.find((value) => valueIds.has(value.id))?.value ?? null),
      };
    }),
  };
}

const variantSelect = {
  id: true,
  price: true,
  compareAtPrice: true,
  isActive: true,
  inventory: { select: { quantity: true } },
} satisfies Prisma.ProductVariantSelect;

function toVariantSummary({ id, price, compareAtPrice, isActive, inventory }: Prisma.ProductVariantGetPayload<{ select: typeof variantSelect }>) {
  return {
    variantId: id,
    price: price.toFixed(2),
    compareAtPrice: compareAtPrice?.toFixed(2) ?? null,
    isActive,
    stockQuantity: inventory?.quantity ?? 0,
  };
}

export function createProductsService(prisma: PrismaClient) {
  async function assertReferences(data: { categoryId?: string; brandId?: string | null }) {
    if (data.categoryId) {
      const category = await prisma.category.findUnique({ where: { id: data.categoryId }, select: { id: true } });
      if (!category) {
        throw new AppError(400, "INVALID_CATEGORY", "Category does not exist");
      }
    }

    if (data.brandId) {
      const brand = await prisma.brand.findUnique({ where: { id: data.brandId }, select: { id: true } });
      if (!brand) {
        throw new AppError(400, "INVALID_BRAND", "Brand does not exist");
      }
    }
  }

  async function assertProductExists(id: string) {
    const product = await prisma.product.findUnique({ where: { id }, select: { id: true } });
    if (!product) {
      throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
    }
  }

  /** Dashboard list. Without includeInactive, hidden products are left out. */
  async function listProducts(query: ListProductsQuery) {
    const { limit, offset, categoryId, brandId, search, includeInactive } = query;
    const outOfStock: Prisma.ProductVariantWhereInput = {
      isActive: true,
      OR: [{ inventory: { is: null } }, { inventory: { is: { quantity: { lte: 0 } } } }],
    };
    const filters: Prisma.ProductWhereInput[] = [
      includeInactive && query.status ? { isActive: query.status === "active" } : {},
      query.outOfStock ? { variants: { some: outOfStock } } : {},
      query.missingTax ? { OR: [{ gstRate: null }, { hsnCode: null }] } : {},
    ];
    const where: Prisma.ProductWhereInput = {
      ...(!includeInactive && { isActive: true }),
      ...(brandId && { brandId }),
      AND: [categoryId ? inCategory(categoryId) : {}, search ? productSearch(search, { matchCodes: true }) : {}, ...filters],
    };

    const [rows, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        include: {
          category: { select: categorySummarySelect },
          brand: { select: brandSummarySelect },
          images: { where: { variantId: null }, orderBy: imageOrder, take: 1, select: { url: true } },
          variants: { select: { price: true, isActive: true, inventory: { select: { quantity: true } } } },
        },
        orderBy: { name: "asc" },
        take: limit,
        skip: offset,
      }),
      prisma.product.count({ where }),
    ]);

    const items = rows.map(({ variants, images, gstRate, ...product }) => {
      const active = variants.filter((variant) => variant.isActive);
      const prices = active.map((variant) => variant.price);
      return {
        ...product,
        gstRate: gstRate?.toFixed(2) ?? null,
        imageUrl: images[0]?.url ?? null,
        variantCount: variants.length,
        /** Lowest and highest price of the active variants; null when none is active. */
        priceRange: prices.length
          ? { min: Prisma.Decimal.min(...prices).toFixed(2), max: Prisma.Decimal.max(...prices).toFixed(2) }
          : null,
        /** Units in stock over the active variants. */
        stockQuantity: active.reduce((sum, variant) => sum + (variant.inventory?.quantity ?? 0), 0),
      };
    });

    return { items, total, limit, offset };
  }

  async function getProduct(id: string) {
    const product = await prisma.product.findUnique({ where: { id }, include: detailInclude });

    if (!product) {
      throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
    }

    return toProductDetail(product);
  }

  /** What a shared product link shows: the product and its lowest price among the variants in stock. */
  async function getPreview(id: string) {
    const product = await prisma.product.findFirst({
      where: { id, ...customerVisibleProduct },
      select: {
        id: true,
        name: true,
        description: true,
        brand: { select: { name: true } },
        images: { orderBy: [{ variantId: { sort: "asc", nulls: "first" } }, ...imageOrder], take: 1, select: { url: true } },
      },
    });

    if (!product) {
      throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
    }

    const buyable = {
      ...customerVisibleVariant,
      productId: id,
      inventory: { is: { quantity: { gt: 0 } } },
    } satisfies Prisma.ProductVariantWhereInput;
    const [cheapest, highest] = await Promise.all([
      prisma.productVariant.findFirst({
        where: buyable,
        orderBy: { price: "asc" },
        select: { price: true, compareAtPrice: true, name: true, quantity: true, unit: true },
      }),
      prisma.productVariant.aggregate({ where: buyable, _max: { price: true } }),
    ]);

    return {
      id: product.id,
      name: product.name,
      description: product.description,
      brand: product.brand?.name ?? null,
      imageUrl: product.images[0]?.url ?? null,
      /** Null while nothing is in stock. `varies` when other variants cost more. */
      price: cheapest && {
        price: cheapest.price.toFixed(2),
        compareAtPrice: cheapest.compareAtPrice?.toFixed(2) ?? null,
        label: variantLabel(cheapest),
        varies: !cheapest.price.equals(highest._max.price ?? cheapest.price),
      },
    };
  }

  /** Price, compare-at price or on/off of one variant, without resending the whole product. */
  async function updateVariant(variantId: string, data: UpdateVariantInput) {
    const existing = await prisma.productVariant.findUnique({ where: { id: variantId }, select: { price: true, compareAtPrice: true } });

    if (!existing) {
      throw new AppError(404, "VARIANT_NOT_FOUND", "Variant not found");
    }

    const problem = compareAtPriceProblem(data.price ?? existing.price, data.compareAtPrice === undefined ? existing.compareAtPrice : data.compareAtPrice);
    if (problem) {
      throw new AppError(400, "INVALID_PRICE", problem, { field: "compareAtPrice" });
    }

    return toVariantSummary(await prisma.productVariant.update({ where: { id: variantId }, data, select: variantSelect }));
  }

  async function createProduct({ slug, options, variants, ...data }: CreateProductInput) {
    const finalSlug = slug ?? slugify(data.name);

    if (!finalSlug) {
      throw new AppError(400, "INVALID_SLUG", "Could not derive a slug from the name; provide one");
    }

    await assertReferences(data);

    const id = await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({ data: { ...data, slug: finalSlug }, select: { id: true } });
      await saveVariants(tx, product.id, { options, variants });
      return product.id;
    });

    return getProduct(id);
  }

  async function updateProduct(id: string, data: UpdateProductInput) {
    await assertProductExists(id);
    await assertReferences(data);

    await prisma.product.update({ where: { id }, data });

    return getProduct(id);
  }

  async function setVariants(id: string, input: VariantsInput) {
    await assertProductExists(id);

    await prisma.$transaction(async (tx) => {
      // Serialises concurrent edits of the same product.
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${id} FOR UPDATE`;
      await saveVariants(tx, id, input);
    });

    return getProduct(id);
  }

  async function assertVariantOfProduct(productId: string, variantId: string | null | undefined) {
    if (!variantId) return;
    const variant = await prisma.productVariant.findFirst({ where: { id: variantId, productId }, select: { id: true } });
    if (!variant) {
      throw new AppError(400, "INVALID_VARIANT", "Variant does not belong to this product");
    }
  }

  async function listImages(productId: string) {
    return prisma.productImage.findMany({ where: { productId }, orderBy: imageOrder, select: imageSelect });
  }

  async function addImage(productId: string, { url, altText, variantId }: AddImageInput) {
    await assertProductExists(productId);
    await assertVariantOfProduct(productId, variantId);

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${productId} FOR UPDATE`;
      const { _count, _max } = await tx.productImage.aggregate({
        where: { productId },
        _count: { _all: true },
        _max: { sortOrder: true },
      });
      if (_count._all >= MAX_IMAGES) {
        throw new AppError(409, "TOO_MANY_IMAGES", `A product can have at most ${MAX_IMAGES} images`);
      }
      await tx.productImage.create({
        data: { productId, url, altText: altText ?? null, variantId: variantId ?? null, sortOrder: (_max.sortOrder ?? -1) + 1 },
      });
    });

    return { items: await listImages(productId) };
  }

  async function findImage(productId: string, imageId: string) {
    const image = await prisma.productImage.findFirst({ where: { id: imageId, productId }, select: { id: true } });
    if (!image) {
      throw new AppError(404, "IMAGE_NOT_FOUND", "Image not found");
    }
    return image;
  }

  async function updateImage(productId: string, imageId: string, data: UpdateImageInput) {
    await findImage(productId, imageId);
    await assertVariantOfProduct(productId, data.variantId);

    await prisma.productImage.update({ where: { id: imageId }, data });

    return { items: await listImages(productId) };
  }

  async function deleteImage(productId: string, imageId: string) {
    await findImage(productId, imageId);
    await prisma.productImage.delete({ where: { id: imageId } });

    return { items: await listImages(productId) };
  }

  /** imageIds must be exactly the product's images, in the new order. */
  async function reorderImages(productId: string, imageIds: string[]) {
    await assertProductExists(productId);

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${productId} FOR UPDATE`;
      const current = await tx.productImage.findMany({ where: { productId }, select: { id: true } });
      const currentIds = new Set(current.map((image) => image.id));
      if (imageIds.length !== currentIds.size || new Set(imageIds).size !== imageIds.length || imageIds.some((id) => !currentIds.has(id))) {
        throw new AppError(400, "INVALID_IMAGE_ORDER", "List every image of the product exactly once");
      }
      for (const [sortOrder, id] of imageIds.entries()) {
        await tx.productImage.update({ where: { id }, data: { sortOrder } });
      }
    });

    return { items: await listImages(productId) };
  }

  /**
   * Deletes products that were never ordered, with their variants, stock, cart
   * items, images and options. Ordered products are hidden instead, so past orders keep them.
   * Products picked on the home screen are left until they are removed there.
   */
  async function deleteProducts(ids: string[]) {
    const featured = await featuredProductIds(prisma);

    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Product" WHERE id IN (${Prisma.join(ids)}) FOR UPDATE`;
        const products = await tx.product.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, isActive: true, _count: { select: { orderItems: true } }, variants: { select: { id: true } } },
        });

        const skipped = products
          .filter((product) => featured.has(product.id))
          .map((product) => ({ id: product.id, name: product.name, reason: "Picked on the home screen. Remove it there first." }));
        const removable = products.filter((product) => !featured.has(product.id));
        const unordered = removable.filter((product) => product._count.orderItems === 0);
        const ordered = removable.filter((product) => product._count.orderItems > 0);

        await deleteVariants(tx, unordered.flatMap((product) => product.variants.map((variant) => variant.id)));
        await tx.product.deleteMany({ where: { id: { in: unordered.map((product) => product.id) } } });
        await tx.product.updateMany({
          where: { id: { in: ordered.filter((product) => product.isActive).map((product) => product.id) } },
          data: { isActive: false },
        });

        return { deleted: unordered.length, hidden: ordered.length, skipped, notFound: ids.length - products.length };
      });
    } catch (error) {
      // An order placed for one of them while this ran.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new AppError(409, "PRODUCT_ORDERED", "One of these products was just ordered. Try again.");
      }
      throw error;
    }
  }

  return {
    listProducts,
    getProduct,
    getPreview,
    createProduct,
    updateProduct,
    setVariants,
    addImage,
    updateImage,
    deleteImage,
    reorderImages,
    deleteProducts,
    updateVariant,
  };
}
