import { env } from "../../config/env.js";
import { LOW_STOCK_THRESHOLD } from "../inventory/inventory.service.js";
import { OrderStatus, Prisma, UserRole, type PrismaClient } from "../../generated/prisma/client";
import { startOfTodaySql } from "../../shared/time.js";
import { ACTIVE_ORDER_STATUSES as ACTIVE_STATUSES } from "./order-status.js";

type TodayRow = {
  orders: bigint;
  revenue: Prisma.Decimal | null;
  delivered: bigint;
  cancelled: bigint;
};

/** Minutes before a waiting order is flagged to admins. Matches the red timers on the order board. */
export const ATTENTION_MINUTES = {
  NOT_ACCEPTED: 10,
  NOT_DISPATCHED: 20,
} as const;

export type AttentionReason = keyof typeof ATTENTION_MINUTES;

const ATTENTION_LIMIT = 50;

type WaitingRow = { id: string; orderNumber: string; status: OrderStatus; since: Date };

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

export function createDashboardService(prisma: PrismaClient) {
  async function getDashboard({ isAdmin }: { isAdmin: boolean }) {
    // "Today" is the calendar day in the client's time zone. Unpaid online orders are not counted.
    const todayQuery = prisma.$queryRaw<TodayRow[]>`
      SELECT
        count(*) FILTER (WHERE status <> 'PENDING_PAYMENT') AS orders,
        sum(total) FILTER (WHERE status NOT IN ('PENDING_PAYMENT', 'CANCELLED')) AS revenue,
        count(*) FILTER (WHERE status = 'DELIVERED') AS delivered,
        count(*) FILTER (WHERE status = 'CANCELLED') AS cancelled
      FROM "Order"
      WHERE "createdAt" >= ${startOfTodaySql()}
    `;

    const [[today], pipeline, lowStock, recent, customers] = await Promise.all([
      todayQuery,
      prisma.order.groupBy({
        by: ["status"],
        where: { status: { in: ACTIVE_STATUSES } },
        _count: { _all: true },
      }),
      prisma.productVariant.count({
        where: {
          isActive: true,
          product: { isActive: true },
          OR: [{ inventory: { is: null } }, { inventory: { is: { quantity: { lte: LOW_STOCK_THRESHOLD } } } }],
        },
      }),
      prisma.order.findMany({
        where: { status: { not: OrderStatus.PENDING_PAYMENT } },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          total: true,
          paymentMethod: true,
          customerName: true,
          createdAt: true,
        },
      }),
      isAdmin ? prisma.user.count({ where: { role: UserRole.CUSTOMER } }) : Promise.resolve(null),
    ]);

    const pipelineCounts = Object.fromEntries(ACTIVE_STATUSES.map((status) => [status, 0])) as Record<OrderStatus, number>;
    for (const row of pipeline) {
      pipelineCounts[row.status] = row._count._all;
    }

    return {
      timezone: env.TIMEZONE,
      currency: env.CURRENCY,
      today: {
        orders: Number(today?.orders ?? 0),
        revenue: (today?.revenue ?? new Prisma.Decimal(0)).toFixed(2),
        delivered: Number(today?.delivered ?? 0),
        cancelled: Number(today?.cancelled ?? 0),
      },
      pipeline: pipelineCounts,
      activeOrders: Object.values(pipelineCounts).reduce((sum, count) => sum + count, 0),
      awaitingDispatch: pipelineCounts.READY_FOR_PICKUP,
      lowStock: { count: lowStock, threshold: LOW_STOCK_THRESHOLD },
      customers,
      recentOrders: recent.map(({ total, ...order }) => ({ ...order, total: total.toFixed(2) })),
    };
  }

  /**
   * Orders left waiting: not yet accepted, or the packed order has not gone out for
   * delivery. Oldest first. Nothing changes automatically; an admin decides.
   */
  async function getAttention() {
    const waiting = await prisma.$queryRaw<WaitingRow[]>`
      SELECT o.id, o."orderNumber", o.status, h.since
      FROM "Order" o
      CROSS JOIN LATERAL (
        SELECT coalesce(max(h."createdAt"), o."createdAt") AS since
        FROM "OrderStatusHistory" h
        WHERE h."orderId" = o.id AND h."toStatus" = o.status AND h."fromStatus" IS DISTINCT FROM h."toStatus"
      ) h
      WHERE (o.status = 'CONFIRMED' AND h.since < ${minutesAgo(ATTENTION_MINUTES.NOT_ACCEPTED)})
         OR (o.status = 'READY_FOR_PICKUP' AND h.since < ${minutesAgo(ATTENTION_MINUTES.NOT_DISPATCHED)})
      ORDER BY h.since
      LIMIT ${ATTENTION_LIMIT}
    `;

    const items = waiting.map((row) => ({
      orderId: row.id,
      orderNumber: row.orderNumber,
      reason: (row.status === OrderStatus.CONFIRMED ? "NOT_ACCEPTED" : "NOT_DISPATCHED") as AttentionReason,
      since: row.since,
    }));

    return { items, minutes: ATTENTION_MINUTES };
  }

  return { getDashboard, getAttention };
}
