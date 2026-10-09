import { OrderStatus, Prisma, ReviewSource, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import type { AdminReviewInput, AdminReviewsQuery, ProductReviewsQuery, ReviewInput } from "./reviews.schemas.js";

const productNotFound = () => new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
const reviewNotFound = () => new AppError(404, "REVIEW_NOT_FOUND", "Review not found");

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
        select: { id: true, rating: true, comment: true, updatedAt: true, source: true, authorName: true, user: { select: { name: true } } },
      }),
      prisma.productReview.count({ where: withComment }),
    ]);

    const counts = new Map(byRating.map((row) => [row.rating, row._count]));
    return {
      average: summary._avg.rating === null ? null : summary._avg.rating.toFixed(1),
      count: summary._count,
      /** Number of ratings with 1 to 5 stars, in that order. */
      distribution: [1, 2, 3, 4, 5].map((stars) => counts.get(stars) ?? 0),
      items: rows.map(({ user, source, authorName, ...review }) => ({
        ...review,
        name: source === ReviewSource.ADMIN ? authorName! : reviewerName(user?.name ?? null),
        verified: source === ReviewSource.CUSTOMER,
      })),
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

  async function listReviews({ rating, hidden, source, limit, offset }: AdminReviewsQuery) {
    const where: Prisma.ProductReviewWhereInput = {
      ...(rating && { rating }),
      ...(hidden !== undefined && { isHidden: hidden }),
      ...(source && { source }),
    };
    const [rows, total] = await prisma.$transaction([
      prisma.productReview.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          source: true,
          authorName: true,
          rating: true,
          comment: true,
          isHidden: true,
          createdAt: true,
          updatedAt: true,
          product: { select: { id: true, name: true } },
          user: { select: { id: true, name: true, phone: true, deletedAt: true } },
          order: { select: { id: true, orderNumber: true } },
          createdBy: { select: { name: true, email: true } },
        },
      }),
      prisma.productReview.count({ where }),
    ]);
    return {
      items: rows.map(({ user, createdBy, ...review }) => ({
        ...review,
        customer: user && { id: user.id, name: user.name, phone: user.deletedAt ? null : user.phone },
        addedBy: createdBy && (createdBy.name ?? createdBy.email),
      })),
      total,
      limit,
      offset,
    };
  }

  /** A review under a name the admin enters. It counts toward the rating but is never a verified purchase. */
  async function addReview(adminId: string, input: AdminReviewInput) {
    const product = await prisma.product.findUnique({ where: { id: input.productId }, select: { id: true } });
    if (!product) throw productNotFound();
    return prisma.productReview.create({
      data: {
        productId: input.productId,
        source: ReviewSource.ADMIN,
        authorName: input.authorName,
        rating: input.rating,
        comment: input.comment || null,
        createdById: adminId,
      },
      select: { id: true, productId: true, source: true, authorName: true, rating: true, comment: true, createdAt: true },
    });
  }

  /** Only reviews an admin added can be deleted; customer reviews are hidden instead. */
  async function deleteReview(id: string) {
    const review = await prisma.productReview.findUnique({ where: { id }, select: { source: true } });
    if (!review) throw reviewNotFound();
    if (review.source !== ReviewSource.ADMIN) {
      throw new AppError(409, "CUSTOMER_REVIEW", "Customer reviews can be hidden, not deleted");
    }
    await prisma.productReview.delete({ where: { id } });
    return { id };
  }

  async function setHidden(id: string, isHidden: boolean) {
    try {
      return await prisma.productReview.update({ where: { id }, data: { isHidden }, select: { id: true, isHidden: true } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") throw reviewNotFound();
      throw error;
    }
  }

  return { reviewProduct, productReviews, orderReviews, listReviews, setHidden, addReview, deleteReview };
}
