import { OrderStatus, Prisma, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import type { AdminReviewsQuery, ProductReviewsQuery, ReviewInput } from "./reviews.schemas.js";

const productNotFound = () => new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");

/** "Piyush Kumar Sharma" becomes "Piyush S."; deleted accounts and missing names show as "Customer". */
export function reviewerName(name: string | null) {
  const parts = name?.trim().split(/\s+/) ?? [];
  if (!parts[0]) return "Customer";
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts.at(-1)!.charAt(0).toUpperCase()}.`;
}

const reviewSelect = { productId: true, rating: true, comment: true, updatedAt: true } satisfies Prisma.ProductReviewSelect;

export function createReviewsService(prisma: PrismaClient) {
  /** Rates a product the customer received in a delivered order; rating it again replaces the review. */
  async function reviewProduct(userId: string, productId: string, input: ReviewInput) {
    const received = await prisma.orderItem.findFirst({
      where: {
        productId,
        quantity: { gt: prisma.orderItem.fields.unavailableQuantity },
        order: { userId, status: OrderStatus.DELIVERED },
      },
      orderBy: { order: { createdAt: "desc" } },
      select: { orderId: true },
    });
    if (!received) {
      const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
      if (!product) throw productNotFound();
      throw new AppError(409, "PRODUCT_NOT_RECEIVED", "You can review products from your delivered orders");
    }

    const comment = input.comment === undefined ? undefined : input.comment || null;
    const update = { rating: input.rating, orderId: received.orderId, ...(comment !== undefined && { comment }) };
    const upsert = () =>
      prisma.productReview.upsert({
        where: { userId_productId: { userId, productId } },
        create: { userId, productId, orderId: received.orderId, rating: input.rating, comment: comment ?? null },
        update,
        select: reviewSelect,
      });

    try {
      return await upsert();
    } catch (error) {
      // Two first reviews at once: the loser of the insert race updates the winner's row.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return upsert();
      throw error;
    }
  }

  /** The product's average rating over visible reviews, and those with a comment, newest first. */
  async function productReviews(productId: string, { limit, offset }: ProductReviewsQuery) {
    const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!product) throw productNotFound();

    const visible = { productId, isHidden: false } satisfies Prisma.ProductReviewWhereInput;
    const withComment = { ...visible, comment: { not: null } } satisfies Prisma.ProductReviewWhereInput;
    const [summary, byRating, rows, total] = await prisma.$transaction([
      prisma.productReview.aggregate({ where: visible, _avg: { rating: true }, _count: true }),
      prisma.productReview.groupBy({ by: ["rating"], where: visible, orderBy: { rating: "asc" }, _count: true }),
      prisma.productReview.findMany({
        where: withComment,
        orderBy: { updatedAt: "desc" },
        take: limit,
        skip: offset,
        select: { id: true, rating: true, comment: true, updatedAt: true, user: { select: { name: true } } },
      }),
      prisma.productReview.count({ where: withComment }),
    ]);

    const counts = new Map(byRating.map((row) => [row.rating, row._count]));
    return {
      average: summary._avg.rating === null ? null : summary._avg.rating.toFixed(1),
      count: summary._count,
      /** Number of ratings with 1 to 5 stars, in that order. */
      distribution: [1, 2, 3, 4, 5].map((stars) => counts.get(stars) ?? 0),
      items: rows.map(({ user, ...review }) => ({ ...review, name: reviewerName(user.name) })),
      total,
      limit,
      offset,
    };
  }

  /** The products in one of the customer's orders, with their review of each. Delivered orders only. */
  async function orderReviews(userId: string, orderId: string) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId },
      select: {
        status: true,
        items: {
          orderBy: { createdAt: "asc" },
          select: { productId: true, productName: true, imageUrl: true, quantity: true, unavailableQuantity: true },
        },
      },
    });
    if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
    if (order.status !== OrderStatus.DELIVERED) return { items: [] };

    const products = new Map<string, (typeof order.items)[number]>();
    for (const item of order.items) {
      if (item.quantity > item.unavailableQuantity && !products.has(item.productId)) products.set(item.productId, item);
    }
    const reviews = await prisma.productReview.findMany({
      where: { userId, productId: { in: [...products.keys()] } },
      select: reviewSelect,
    });
    const byProduct = new Map(reviews.map((review) => [review.productId, review]));

    return {
      items: [...products.values()].map((item) => ({
        productId: item.productId,
        productName: item.productName,
        imageUrl: item.imageUrl,
        rating: byProduct.get(item.productId)?.rating ?? null,
        comment: byProduct.get(item.productId)?.comment ?? null,
      })),
    };
  }

  async function listReviews({ rating, hidden, limit, offset }: AdminReviewsQuery) {
    const where: Prisma.ProductReviewWhereInput = { ...(rating && { rating }), ...(hidden !== undefined && { isHidden: hidden }) };
    const [rows, total] = await prisma.$transaction([
      prisma.productReview.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          rating: true,
          comment: true,
          isHidden: true,
          createdAt: true,
          updatedAt: true,
          product: { select: { id: true, name: true } },
          user: { select: { id: true, name: true, phone: true, deletedAt: true } },
          order: { select: { id: true, orderNumber: true } },
        },
      }),
      prisma.productReview.count({ where }),
    ]);
    return {
      items: rows.map(({ user, ...review }) => ({
        ...review,
        customer: { id: user.id, name: user.name, phone: user.deletedAt ? null : user.phone },
      })),
      total,
      limit,
      offset,
    };
  }

  async function setHidden(id: string, isHidden: boolean) {
    try {
      return await prisma.productReview.update({ where: { id }, data: { isHidden }, select: { id: true, isHidden: true } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new AppError(404, "REVIEW_NOT_FOUND", "Review not found");
      }
      throw error;
    }
  }

  return { reviewProduct, productReviews, orderReviews, listReviews, setHidden };
}
