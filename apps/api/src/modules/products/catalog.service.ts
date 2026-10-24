import { Prisma, type PrismaClient } from "../../generated/prisma/client";
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
import type { ListCatalogQuery } from "./products.schemas.js";

/** Products customers can see: visible, with at least one active variant. */
export const catalogProductWhere = {
  ...customerVisibleProduct,
  variants: { some: { isActive: true } },
} satisfies Prisma.ProductWhereInput;

function productInclude(options: { detail: boolean }) {
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
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        optionValues: { select: { optionValueId: true } },
        inventory: { select: { quantity: true } },
      },
    },
  } satisfies Prisma.ProductInclude;
}

/** For product cards: everything but the options. */
export const catalogProductInclude = productInclude({ detail: false });

type CatalogProductRow = Prisma.ProductGetPayload<{ include: typeof catalogProductInclude }>;
type CatalogProductDetailRow = CatalogProductRow & {
  options: { id: string; name: string; values: { id: string; value: string }[] }[];
};

function toVariantView(row: CatalogProductRow, variant: CatalogProductRow["variants"][number], options: { detail: boolean }) {
  return {
    variantId: variant.id,
    label: variantLabel(variant),
    name: variant.name,
    unit: variant.unit,
    quantity: variant.quantity?.toString() ?? null,
    imageUrl: imagesFor(row.images, variant.id)[0]?.url ?? null,
    price: variant.price.toFixed(2),
    compareAtPrice: variant.compareAtPrice?.toFixed(2) ?? null,
    inStock: (variant.inventory?.quantity ?? 0) > 0,
    maxOrderQuantity: maxOrderQuantity(variant),
    ...(options.detail && { weightGrams: variant.weightGrams }),
    ...(options.detail && { optionValueIds: variant.optionValues.map((link) => link.optionValueId) }),
  };
}

function toCardView(row: CatalogProductRow) {
  return {
    productId: row.id,
    name: row.name,
    slug: row.slug,
    category: row.category,
    brand: row.brand,
    imageUrl: row.images.find((image) => image.variantId === null)?.url ?? row.images[0]?.url ?? null,
    variants: row.variants.map((variant) => toVariantView(row, variant, { detail: false })),
  };
}

/** Average rating and number of ratings over each product's visible reviews; unrated products are left out. */
async function productRatings(prisma: PrismaClient, productIds: string[]) {
  if (productIds.length === 0) return new Map<string, { average: string; count: number }>();
  const rows = await prisma.productReview.groupBy({
    by: ["productId"],
    where: { productId: { in: productIds }, isHidden: false },
    _avg: { rating: true },
    _count: true,
  });
  return new Map(rows.map((row) => [row.productId, { average: row._avg.rating!.toFixed(1), count: row._count }]));
}

/** Product card views of the rows, with each product's rating (null until it has one). */
export async function toProductCards(prisma: PrismaClient, rows: CatalogProductRow[]) {
  const ratings = await productRatings(prisma, rows.map((row) => row.id));
  return rows.map((row) => ({ ...toCardView(row), rating: ratings.get(row.id) ?? null }));
}

function toProductDetailView(row: CatalogProductDetailRow) {
  return {
    productId: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    category: row.category,
    brand: row.brand,
    manufacturerName: row.manufacturerName,
    manufacturerAddress: row.manufacturerAddress,
    countryOfOrigin: row.countryOfOrigin,
    specifications: row.specifications,
    images: row.images,
    options: row.options,
    variants: row.variants.map((variant) => toVariantView(row, variant, { detail: true })),
  };
}

/** What customers browse and buy, with prices and whether each variant is in stock. */
export function createCatalogService(prisma: PrismaClient) {
  async function listProducts({ limit, offset, categoryId, brandId, search, minPrice, maxPrice, inStock, sortBy }: ListCatalogQuery) {
    const variantWhere: Prisma.ProductVariantWhereInput = {
      isActive: true,
      ...(minPrice !== undefined && { price: { gte: new Prisma.Decimal(minPrice) } }),
      ...(maxPrice !== undefined && { price: { ...(minPrice !== undefined ? { gte: new Prisma.Decimal(minPrice) } : {}), lte: new Prisma.Decimal(maxPrice) } }),
      ...(inStock && { inventory: { quantity: { gt: 0 } } }),
    };

    const hasVariantFilter = minPrice !== undefined || maxPrice !== undefined || inStock;

    const where: Prisma.ProductWhereInput = {
      ...catalogProductWhere,
      ...(brandId && { brandId }),
      ...(hasVariantFilter && {
        variants: {
          some: variantWhere,
        },
      }),
      AND: [categoryId ? inCategory(categoryId) : {}, search ? productSearch(search, { matchCodes: false }) : {}],
    };

    let orderBy: Prisma.ProductOrderByWithRelationInput = { name: "asc" };
    if (sortBy === "newest") {
      orderBy = { createdAt: "desc" };
    } else if (sortBy === "name_asc") {
      orderBy = { name: "asc" };
    }

    const [rows, total] = await prisma.$transaction([
      prisma.product.findMany({ where, include: catalogProductInclude, orderBy, take: limit, skip: offset }),
      prisma.product.count({ where }),
    ]);

    let items = await toProductCards(prisma, rows);
    if (sortBy === "price_asc") {
      items.sort((a, b) => {
        const minA = Math.min(...a.variants.map((v) => Number(v.price)));
        const minB = Math.min(...b.variants.map((v) => Number(v.price)));
        return minA - minB;
      });
    } else if (sortBy === "price_desc") {
      items.sort((a, b) => {
        const maxA = Math.max(...a.variants.map((v) => Number(v.price)));
        const maxB = Math.max(...b.variants.map((v) => Number(v.price)));
        return maxB - maxA;
      });
    }

    return { items, total, limit, offset };
  }

  async function getProduct(productId: string) {
    const product = await prisma.product.findFirst({
      where: {
        OR: [{ id: productId }, { slug: productId }],
        ...catalogProductWhere,
      },
      include: productInclude({ detail: true }),
    });

    if (!product) {
      throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
    }

    return toProductDetailView(product as CatalogProductDetailRow);
  }

  return { listProducts, getProduct };
}
