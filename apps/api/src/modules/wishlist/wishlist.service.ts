import { Prisma, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { customerVisibleProduct, imageOrder } from "../products/catalog.js";
import { catalogProductInclude, catalogProductWhere, toProductCards } from "../products/catalog.service.js";
import { MAX_WISHLIST_ITEMS, type WishlistQuery } from "./wishlist.schemas.js";

export function createWishlistService(prisma: PrismaClient) {
  const visible = (userId: string) => ({ userId, product: customerVisibleProduct }) satisfies Prisma.WishlistItemWhereInput;

  /**
   * Saved products, newest first. `product` is the product card (price, stock, variants); null when
   * none of its variants is on sale.
   */
  async function list(userId: string, { limit, offset }: WishlistQuery) {
    const [rows, total] = await prisma.$transaction([
      prisma.wishlistItem.findMany({
        where: visible(userId),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
        skip: offset,
        select: {
          productId: true,
          createdAt: true,
          product: {
            select: {
              name: true,
              images: { orderBy: [{ variantId: { sort: "asc", nulls: "first" } }, ...imageOrder], take: 1, select: { url: true } },
            },
          },
        },
      }),
      prisma.wishlistItem.count({ where: visible(userId) }),
    ]);

    const products =
      rows.length > 0
        ? await prisma.product.findMany({
            where: { id: { in: rows.map((row) => row.productId) }, ...catalogProductWhere },
            include: catalogProductInclude,
          })
        : [];
    const cards = await toProductCards(prisma, products);
    const byId = new Map(cards.map((card) => [card.productId, card]));

    return {
      items: rows.map((row) => ({
        productId: row.productId,
        name: row.product.name,
        imageUrl: row.product.images[0]?.url ?? null,
        addedAt: row.createdAt,
        product: byId.get(row.productId) ?? null,
      })),
      total,
      limit,
      offset,
    };
  }

  /** Every saved product id, so the app can fill in the hearts on product cards. */
  async function productIds(userId: string) {
    const rows = await prisma.wishlistItem.findMany({
      where: visible(userId),
      orderBy: { createdAt: "desc" },
      take: MAX_WISHLIST_ITEMS,
      select: { productId: true },
    });
    return { productIds: rows.map((row) => row.productId) };
  }

  async function add(userId: string, productId: string) {
    const product = await prisma.product.findFirst({ where: { id: productId, ...customerVisibleProduct }, select: { id: true } });
    if (!product) throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");

    const existing = await prisma.wishlistItem.findUnique({ where: { userId_productId: { userId, productId } }, select: { id: true } });
    if (!existing) {
      if ((await prisma.wishlistItem.count({ where: { userId } })) >= MAX_WISHLIST_ITEMS) {
        throw new AppError(409, "WISHLIST_FULL", `Your wishlist can hold up to ${MAX_WISHLIST_ITEMS} products. Remove some to add more.`);
      }
      try {
        await prisma.wishlistItem.create({ data: { userId, productId } });
      } catch (error) {
        // Saved at the same moment from another request.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
      }
    }

    return { productId, saved: true };
  }

  /** Removing a product that isn't saved is not an error, so a repeated tap can't fail. */
  async function remove(userId: string, productId: string) {
    await prisma.wishlistItem.deleteMany({ where: { userId, productId } });
    return { productId, saved: false };
  }

  return { list, productIds, add, remove };
}
