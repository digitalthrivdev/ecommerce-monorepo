import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { slugify } from "../../shared/schemas.js";
import {
  brandSummarySelect,
  categorySummarySelect,
  customerVisibleProduct,
  imageOrder,
  imageSelect,
  inCategory,
  productSearch,
  variantLabel,
} from "./catalog.js";
import {
  MAX_IMAGES,
  type AddImageInput,
  type CreateProductInput,
  type ListProductsQuery,
  type UpdateImageInput,
  type UpdateProductInput,
  type VariantsInput,
} from "./products.schemas.js";
import { saveVariants } from "./variants.js";

function detailInclude(includeInactive: boolean) {
  return {
    category: { select: categorySummarySelect },
    brand: { select: brandSummarySelect },
    options: {
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, values: { orderBy: { sortOrder: "asc" }, select: { id: true, value: true } } },
    },
    variants: {
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { optionValues: { select: { optionValueId: true } } },
    },
    images: { orderBy: imageOrder, select: imageSelect },
  } satisfies Prisma.ProductInclude;
}

type ProductDetail = Prisma.ProductGetPayload<{ include: ReturnType<typeof detailInclude> }>;

/** The catalog definition of a product, without store prices. Variant option values follow the order of `options`. */
export function toProductDetail({ options, variants, gstRate, ...product }: ProductDetail) {
  return {
    ...product,
    gstRate: gstRate?.toFixed(2) ?? null,
    options,
    variants: variants.map(({ optionValues, quantity, ...variant }) => {
      const valueIds = new Set(optionValues.map((link) => link.optionValueId));
      return {
        ...variant,
        quantity: quantity?.toString() ?? null,
        label: variantLabel({ ...variant, quantity }),
        optionValues: options.map((option) => option.values.find((value) => valueIds.has(value.id))?.value ?? null),
      };
    }),
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

  async function listProducts(query: ListProductsQuery) {
    const { limit, offset, categoryId, brandId, search, includeInactive } = query;
    const listed: Prisma.ProductVariantWhereInput = { stores: { some: {} } };
    // Status, selling and stock filters are admin information, so they need includeInactive.
    const adminFilters: Prisma.ProductWhereInput[] = includeInactive
      ? [
          query.status ? { isActive: query.status === "active" } : {},
          query.selling === "yes" ? { variants: { some: listed } } : query.selling === "no" ? { variants: { none: listed } } : {},
          query.outOfStock
            ? {
                variants: {
                  some: {
                    isActive: true,
                    stores: { some: { OR: [{ inventory: { is: null } }, { inventory: { is: { quantity: { lte: 0 } } } }] } },
                  },
                },
              }
            : {},
          query.missingTax ? { OR: [{ gstRate: null }, { hsnCode: null }] } : {},
        ]
      : [];
    const where: Prisma.ProductWhereInput = {
      ...(includeInactive ? {} : customerVisibleProduct),
      ...(brandId && { brandId }),
      AND: [categoryId ? inCategory(categoryId) : {}, search ? productSearch(search, { matchCodes: includeInactive }) : {}, ...adminFilters],
    };

    const [rows, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        include: {
          category: { select: categorySummarySelect },
          brand: { select: brandSummarySelect },
          images: { where: { variantId: null }, orderBy: imageOrder, take: 1, select: { url: true } },
          _count: { select: { variants: includeInactive ? true : { where: { isActive: true } } } },
        },
        orderBy: { name: "asc" },
        take: limit,
        skip: offset,
      }),
      prisma.product.count({ where }),
    ]);

    // How many stores list the product is admin information.
    const storeCounts = new Map<string, number>();
    if (includeInactive && rows.length > 0) {
      const listings = await prisma.storeProduct.findMany({
        where: { variant: { productId: { in: rows.map((row) => row.id) } } },
        select: { storeId: true, variant: { select: { productId: true } } },
      });
      const stores = new Map<string, Set<string>>();
      for (const listing of listings) {
        const set = stores.get(listing.variant.productId) ?? new Set();
        set.add(listing.storeId);
        stores.set(listing.variant.productId, set);
      }
      for (const [productId, set] of stores) storeCounts.set(productId, set.size);
    }

    const items = rows.map(({ _count, images, gstRate, ...product }) => ({
      ...product,
      gstRate: gstRate?.toFixed(2) ?? null,
      imageUrl: images[0]?.url ?? null,
      variantCount: _count.variants,
      ...(includeInactive && { storeCount: storeCounts.get(product.id) ?? 0 }),
    }));

    return { items, total, limit, offset };
  }

  async function getProduct(id: string, options: { includeInactive: boolean }) {
    const product = await prisma.product.findFirst({
      where: options.includeInactive ? { id } : { id, ...customerVisibleProduct },
      include: detailInclude(options.includeInactive),
    });

    if (!product) {
      throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
    }

    return toProductDetail(product);
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

    return getProduct(id, { includeInactive: true });
  }

  async function updateProduct(id: string, data: UpdateProductInput) {
    await assertProductExists(id);
    await assertReferences(data);

    await prisma.product.update({ where: { id }, data });

    return getProduct(id, { includeInactive: true });
  }

  async function setVariants(id: string, input: VariantsInput) {
    await assertProductExists(id);

    await prisma.$transaction(async (tx) => {
      // Serialises concurrent edits of the same product.
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${id} FOR UPDATE`;
      await saveVariants(tx, id, input);
    });

    return getProduct(id, { includeInactive: true });
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

  return {
    listProducts,
    getProduct,
    createProduct,
    updateProduct,
    setVariants,
    addImage,
    updateImage,
    deleteImage,
    reorderImages,
  };
}
