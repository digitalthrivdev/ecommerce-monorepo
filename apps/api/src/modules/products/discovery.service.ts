import { OrderStatus, Prisma, StoreStatus, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { brandSummarySelect } from "./catalog.js";
import { storeProductInclude, storeProductWhere, toStoreProductViews } from "./store-products.service.js";

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

/** Listings a customer can buy right now at the store, joined down to their category. */
const inStockListings = (storeId: string) => Prisma.sql`
  FROM "StoreProduct" sp
  JOIN "Inventory" i ON i."storeProductId" = sp.id
  JOIN "ProductVariant" v ON v.id = sp."variantId"
  JOIN "Product" p ON p.id = v."productId"
  JOIN "Category" c ON c.id = p."categoryId"
  WHERE sp."storeId" = ${storeId} AND sp."isAvailable" AND v."isActive" AND p."isActive" AND c."isActive" AND i.quantity > 0
`;

export function createDiscoveryService(prisma: PrismaClient) {
  async function assertActiveStore(storeId: string) {
    const store = await prisma.store.findFirst({ where: { id: storeId, status: StoreStatus.ACTIVE }, select: { id: true } });
    if (!store) {
      throw new AppError(404, "STORE_NOT_FOUND", "Store not found");
    }
  }

  /** Customer views of the products, in the given order, keeping those with a variant in stock at the store. */
  async function inStockProducts(storeId: string, productIds: string[], limit: number) {
    if (productIds.length === 0) return [];
    const rows = await prisma.product.findMany({
      where: { id: { in: productIds }, ...storeProductWhere(storeId, false) },
      include: storeProductInclude(storeId),
    });
    const views = await toStoreProductViews(prisma, rows, { includeStock: false });
    const byId = new Map(views.map((view) => [view.productId, view]));
    return productIds
      .flatMap((id) => byId.get(id) ?? [])
      .filter((product) => product.variants.some((variant) => variant.inStock))
      .slice(0, limit);
  }

  /** In-stock products with the biggest discount off MRP, optionally within a category and its sub-categories. */
  async function dealProducts(storeId: string, categoryId: string | null, limit: number) {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT v."productId" AS id
      ${inStockListings(storeId)}
        AND sp.mrp > sp."sellingPrice" ${categoryFilter(categoryId)}
      GROUP BY v."productId"
      ORDER BY MAX((sp.mrp - sp."sellingPrice") / sp.mrp) DESC, v."productId"
      LIMIT ${limit * CANDIDATE_FACTOR}
    `;
    return inStockProducts(
      storeId,
      rows.map((row) => row.id),
      limit,
    );
  }

  /** Biggest whole-percent discount on an in-stock item of each category, counting its sub-categories. */
  async function categoryDiscounts(storeId: string, categoryIds: string[]) {
    if (categoryIds.length === 0) return new Map<string, number>();
    const rows = await prisma.$queryRaw<{ categoryId: string; parentId: string | null; percent: number }[]>`
      SELECT c.id AS "categoryId", c."parentId" AS "parentId", MAX(FLOOR((sp.mrp - sp."sellingPrice") * 100 / sp.mrp))::int AS percent
      ${inStockListings(storeId)}
        AND sp.mrp > sp."sellingPrice"
      GROUP BY c.id, c."parentId"
    `;
    return new Map(
      categoryIds.map((id) => [id, Math.max(0, ...rows.filter((row) => row.categoryId === id || row.parentId === id).map((row) => row.percent))]),
    );
  }

  /** Customer views of the given products that are in stock at the store, in the given order. */
  async function productsByIds(storeId: string, productIds: string[]) {
    return inStockProducts(storeId, productIds, productIds.length);
  }

  /**
   * Images of each category's biggest in-stock deals, counting its sub-categories, at most `perCategory`
   * each. A product's image is its first product-level one, like on its card.
   */
  async function categoryDealImages(storeId: string, categoryIds: string[], perCategory: number) {
    const images = new Map<string, string[]>(categoryIds.map((id) => [id, []]));
    if (categoryIds.length === 0) return images;
    const ids = Prisma.join(categoryIds);
    const rows = await prisma.$queryRaw<{ categoryId: string; url: string }[]>`
      WITH deals AS (
        SELECT CASE WHEN c.id IN (${ids}) THEN c.id ELSE c."parentId" END AS "categoryId",
               p.id AS "productId",
               MAX((sp.mrp - sp."sellingPrice") / sp.mrp) AS discount
        ${inStockListings(storeId)}
          AND sp.mrp > sp."sellingPrice" AND (c.id IN (${ids}) OR c."parentId" IN (${ids}))
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
   * Active brands with something in stock at the store, most products first. With `brandIds`, only
   * those brands, in that order.
   */
  async function storeBrands(storeId: string, options: { categoryId?: string | null; brandIds?: string[]; limit: number }) {
    const rows = await prisma.$queryRaw<{ id: string; products: number }[]>`
      SELECT p."brandId" AS id, COUNT(DISTINCT p.id)::int AS products
      ${inStockListings(storeId)}
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
  async function alsoBought(storeId: string, productIds: string[], limit: number) {
    await assertActiveStore(storeId);
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
        storeId,
        rows.map((row) => row.id),
        limit,
      ),
    };
  }

  /** What the customer has ordered before, most often first, that the store has in stock now. */
  async function buyAgain(userId: string, storeId: string, limit: number) {
    await assertActiveStore(storeId);
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
        storeId,
        rows.map((row) => row.id),
        limit,
      ),
    };
  }

  /** `GET /stores/:storeId/brands`: brands to browse at the store, optionally within a category. */
  async function listStoreBrands(storeId: string, categoryId: string | undefined, limit: number) {
    await assertActiveStore(storeId);
    return { items: await storeBrands(storeId, { categoryId, limit }) };
  }

  return { dealProducts, categoryDiscounts, categoryDealImages, productsByIds, storeBrands, alsoBought, buyAgain, listStoreBrands };
}
