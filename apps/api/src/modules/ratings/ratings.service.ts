import { OrderStatus, Prisma, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { endOfDay, startOfDay } from "../../shared/time.js";
import { deliveredAt, deliveredEntry } from "../orders/order-status.js";
import { ratingDeadline } from "../orders/orders.service.js";
import type { LowRatingsQuery, RateOrderInput } from "./ratings.schemas.js";

/** Ratings at or below this many stars, for the delivery or the items, are listed for follow-up. */
export const LOW_RATING = 2;

const alreadyRated = () => new AppError(409, "ALREADY_RATED", "You've already rated this order");

export function createRatingsService(prisma: PrismaClient) {
  async function rateOrder(userId: string, orderId: string, input: RateOrderInput) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId },
      select: { status: true, statusHistory: deliveredEntry, rating: { select: { id: true } } },
    });

    if (!order) {
      throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
    }
    if (order.status !== OrderStatus.DELIVERED) {
      throw new AppError(409, "ORDER_NOT_DELIVERED", "You can rate the order once it is delivered");
    }
    if (order.rating) {
      throw alreadyRated();
    }
    const deadline = ratingDeadline(deliveredAt(order.statusHistory));
    if (!deadline || deadline <= new Date()) {
      throw new AppError(409, "RATING_WINDOW_CLOSED", "Orders can be rated up to 7 days after delivery");
    }

    try {
      return await prisma.orderRating.create({
        data: { orderId, deliveryRating: input.deliveryRating, itemsRating: input.itemsRating ?? null, comment: input.comment },
        select: { deliveryRating: true, itemsRating: true, comment: true, createdAt: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw alreadyRated();
      }
      throw error;
    }
  }

  /** Low ratings, newest first. */
  async function listLowRatings({ from, to, limit, offset }: LowRatingsQuery) {
    const where: Prisma.OrderRatingWhereInput = {
      OR: [{ deliveryRating: { lte: LOW_RATING } }, { itemsRating: { lte: LOW_RATING } }],
      ...((from || to) && { createdAt: { ...(from && { gte: startOfDay(from) }), ...(to && { lt: endOfDay(to) }) } }),
    };

    const [rows, total] = await prisma.$transaction([
      prisma.orderRating.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          deliveryRating: true,
          itemsRating: true,
          comment: true,
          createdAt: true,
          order: {
            select: {
              id: true,
              orderNumber: true,
              customerName: true,
              customerPhone: true,
              statusHistory: deliveredEntry,
            },
          },
        },
      }),
      prisma.orderRating.count({ where }),
    ]);

    return {
      items: rows.map(({ order: { statusHistory, ...order }, ...rating }) => ({
        ...rating,
        order: { ...order, deliveredAt: deliveredAt(statusHistory) },
      })),
      total,
      limit,
      offset,
    };
  }

  return { rateOrder, listLowRatings };
}
