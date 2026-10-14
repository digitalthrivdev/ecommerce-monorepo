import { OrderStatus, Prisma, type PrismaClient } from "../../generated/prisma/client";
import { brandSummarySelect } from "./catalog.js";
import { catalogProductInclude, catalogProductWhere, toProductCards } from "./catalog.service.js";

/** Orders that went ahead; abandoned payments and cancellations say nothing about what people buy. */
const COUNTED_ORDER_STATUSES = Prisma.join(
  Object.values(OrderStatus)
    .filter((status) => status !== OrderStatus.PENDING_PAYMENT && status !== OrderStatus.CANCELLED)
    .map((status) => Prisma.sql`${status}::"OrderStatus"`),
);

/** Candidates fetched per result, since some drop out for being hidden or out of stock. */
const CANDIDATE_FACTOR = 3;

const categoryFilter = (categoryId: string | null) =>
  categoryId ? Prisma.sql`AND (c.id = ${categoryId} OR c."parentId" = ${categoryId})` : Prisma.empty;

/** Variants a customer can buy right now, joined down to their category. */
const inStockVariants = Prisma.sql`
  FROM "ProductVariant" v
  JOIN "Inventory" i ON i."variantId" = v.id
  JOIN "Product" p ON p.id = v."productId"
  JOIN "Category" c ON c.id = p."categoryId"
  WHERE v."isActive" AND p."isActive" AND c."isActive" AND i.quantity > 0
`;

export function createDiscoveryService(prisma: PrismaClient) {
  /** Product cards, in the given order, keeping those with a variant in stock. */
  async function inStockProducts(productIds: string[], limit: number) {
    if (productIds.length === 0) return [];
    const rows = await prisma.product.findMany({
      where: { id: { in: productIds }, ...catalogProductWhere },
      include: catalogProductInclude,
    });
    const cards = await toProductCards(prisma, rows);
    const byId = new Map(cards.map((card) => [card.productId, card]));
    return productIds
      .flatMap((id) => byId.get(id) ?? [])
      .filter((product) => product.variants.some((variant) => variant.inStock))
      .slice(0, limit);
  }

  /** In-stock products with the biggest discount off the compare-at price, optionally within a category and its sub-categories. */
  async function dealProducts(categoryId: string | null, limit: number) {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT v."productId" AS id
      ${inStockVariants}
        AND v."compareAtPrice" > v.price ${categoryFilter(categoryId)}
      GROUP BY v."productId"
      ORDER BY MAX((v."compareAtPrice" - v.price) / v."compareAtPrice") DESC, v."productId"
      LIMIT ${limit * CANDIDATE_FACTOR}
    `;
    return inStockProducts(
      rows.map((row) => row.id),
      limit,
    );
  }

  /** Biggest whole-percent discount on an in-stock item of each category, counting its sub-categories. */
  async function categoryDiscounts(categoryIds: string[]) {
    if (categoryIds.length === 0) return new Map<string, number>();
    const rows = await prisma.$queryRaw<{ categoryId: string; parentId: string | null; percent: number }[]>`
      SELECT c.id AS "categoryId", c."parentId" AS "parentId",
             MAX(FLOOR((v."compareAtPrice" - v.price) * 100 / v."compareAtPrice"))::int AS percent
      ${inStockVariants}
        AND v."compareAtPrice" > v.price
      GROUP BY c.id, c."parentId"
    `;
    return new Map(
      categoryIds.map((id) => [id, Math.max(0, ...rows.filter((row) => row.categoryId === id || row.parentId === id).map((row) => row.percent))]),
    );
  }

  /** Product cards of the given products that are in stock, in the given order. */
  async function productsByIds(productIds: string[]) {
    return inStockProducts(productIds, productIds.length);
  }

  /**
   * Images of each category's biggest in-stock deals, counting its sub-categories, at most `perCategory`
   * each. A product's image is its first product-level one, like on its card.
   */
  async function categoryDealImages(categoryIds: string[], perCategory: number) {
    const images = new Map<string, string[]>(categoryIds.map((id) => [id, []]));
    if (categoryIds.length === 0) return images;
    const ids = Prisma.join(categoryIds);
    const rows = await prisma.$queryRaw<{ categoryId: string; url: string }[]>`
      WITH deals AS (
        SELECT CASE WHEN c.id IN (${ids}) THEN c.id ELSE c."parentId" END AS "categoryId",
               p.id AS "productId",
               MAX((v."compareAtPrice" - v.price) / v."compareAtPrice") AS discount
        ${inStockVariants}
          AND v."compareAtPrice" > v.price AND (c.id IN (${ids}) OR c."parentId" IN (${ids}))
        GROUP BY 1, 2
      ), ranked AS (
        SELECT d."categoryId", image.url,
               ROW_NUMBER() OVER (PARTITION BY d."categoryId" ORDER BY d.discount DESC, d."productId") AS rank
        FROM deals d
        JOIN LATERAL (
          SELECT pi.url FROM "ProductImage" pi
          WHERE pi."productId" = d."productId"
          ORDER BY (pi."variantId" IS NOT NULL), pi."sortOrder", pi."createdAt"
          LIMIT 1
        ) image ON true
      )
      SELECT "categoryId", url FROM ranked WHERE rank <= ${perCategory} ORDER BY "categoryId", rank
    `;
    for (const row of rows) images.get(row.categoryId)?.push(row.url);
    return images;
  }

  /**
   * Active brands with something in stock, most products first. With `brandIds`, only those brands,
   * in that order.
   */
  async function inStockBrands(options: { categoryId?: string | null; brandIds?: string[]; limit: number }) {
    const rows = await prisma.$queryRaw<{ id: string; products: number }[]>`
      SELECT p."brandId" AS id, COUNT(DISTINCT p.id)::int AS products
      ${inStockVariants}
        AND p."brandId" IS NOT NULL ${categoryFilter(options.categoryId ?? null)}
        ${options.brandIds ? Prisma.sql`AND p."brandId" IN (${Prisma.join(options.brandIds.length ? options.brandIds : [""])})` : Prisma.empty}
      GROUP BY p."brandId"
      ORDER BY products DESC
    `;
    const order = options.brandIds ?? rows.map((row) => row.id);
    const counts = new Map(rows.map((row) => [row.id, row.products]));
    const brands = await prisma.brand.findMany({ where: { id: { in: [...counts.keys()] }, isActive: true }, select: brandSummarySelect });
    const byId = new Map(brands.map((brand) => [brand.id, brand]));
    return order
      .flatMap((id) => {
        const brand = byId.get(id);
        return brand ? [{ ...brand, productCount: counts.get(id) ?? 0 }] : [];
      })
      .slice(0, options.limit);
  }

  /** Products most often in the same orders as the given ones, excluding them. */
  async function alsoBought(productIds: string[], limit: number) {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT other."productId" AS id
      FROM "OrderItem" item
      JOIN "Order" o ON o.id = item."orderId"
      JOIN "OrderItem" other ON other."orderId" = item."orderId"
      WHERE item."productId" IN (${Prisma.join(productIds)})
        AND other."productId" NOT IN (${Prisma.join(productIds)})
        AND o.status IN (${COUNTED_ORDER_STATUSES})
      GROUP BY other."productId"
      ORDER BY COUNT(DISTINCT other."orderId") DESC, other."productId"
      LIMIT ${limit * CANDIDATE_FACTOR}
    `;
    return {
      items: await inStockProducts(
        rows.map((row) => row.id),
        limit,
      ),
    };
  }

  /** What the customer has ordered before, most often first, that is in stock now. */
  async function buyAgain(userId: string, limit: number) {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT item."productId" AS id
      FROM "OrderItem" item
      JOIN "Order" o ON o.id = item."orderId"
      WHERE o."userId" = ${userId} AND o.status IN (${COUNTED_ORDER_STATUSES})
      GROUP BY item."productId"
      ORDER BY COUNT(DISTINCT item."orderId") DESC, MAX(o."createdAt") DESC
      LIMIT ${limit * CANDIDATE_FACTOR}
    `;
    return {
      items: await inStockProducts(
        rows.map((row) => row.id),
        limit,
      ),
    };
  }

  return { dealProducts, categoryDiscounts, categoryDealImages, productsByIds, inStockBrands, alsoBought, buyAgain };
}
