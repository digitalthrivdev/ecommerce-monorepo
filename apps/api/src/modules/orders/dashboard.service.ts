import { env } from "../../config/env.js";
import { LOW_STOCK_THRESHOLD } from "../inventory/inventory.service.js";
import {
  DeliveryPartnerStatus,
  OrderStatus,
  Prisma,
  UserRole,
  type PrismaClient,
} from "../../generated/prisma/client";
import { ACTIVE_ORDER_STATUSES as ACTIVE_STATUSES } from "./order-status.js";

type TodayRow = {
  orders: bigint;
  revenue: Prisma.Decimal | null;
  delivered: bigint;
  cancelled: bigint;
};

export function createDashboardService(prisma: PrismaClient) {
  /** storeId undefined means all stores (admins only). */
  async function getDashboard({ storeId, isAdmin }: { storeId?: string; isAdmin: boolean }) {
    const storeFilter = storeId ? Prisma.sql`AND "storeId" = ${storeId}` : Prisma.empty;
    const orderWhere: Prisma.OrderWhereInput = storeId ? { storeId } : {};

    // "Today" is the calendar day in the client's time zone. Unpaid online orders are not counted.
    const todayQuery = prisma.$queryRaw<TodayRow[]>`
      SELECT
        count(*) FILTER (WHERE status <> 'PENDING_PAYMENT') AS orders,
        sum(total) FILTER (WHERE status NOT IN ('PENDING_PAYMENT', 'CANCELLED')) AS revenue,
        count(*) FILTER (WHERE status = 'DELIVERED') AS delivered,
        count(*) FILTER (WHERE status = 'CANCELLED') AS cancelled
      FROM "Order"
      WHERE "createdAt" >= (date_trunc('day', now() AT TIME ZONE ${env.TIMEZONE}) AT TIME ZONE ${env.TIMEZONE})
      ${storeFilter}
    `;

    const [[today], pipeline, lowStock, recent, partners, customers] = await Promise.all([
      todayQuery,
      prisma.order.groupBy({
        by: ["status"],
        where: { ...orderWhere, status: { in: ACTIVE_STATUSES } },
        _count: { _all: true },
      }),
      prisma.storeProduct.count({
        where: {
          ...(storeId && { storeId }),
          isAvailable: true,
          OR: [{ inventory: { is: null } }, { inventory: { quantity: { lte: LOW_STOCK_THRESHOLD } } }],
        },
      }),
      prisma.order.findMany({
        where: { ...orderWhere, status: { not: OrderStatus.PENDING_PAYMENT } },
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
          store: { select: { id: true, name: true } },
        },
      }),
      isAdmin
        ? prisma.deliveryPartner.groupBy({ by: ["status"], where: { isActive: true }, _count: { _all: true } })
        : Promise.resolve(null),
      isAdmin ? prisma.user.count({ where: { role: UserRole.CUSTOMER } }) : Promise.resolve(null),
    ]);

    const pipelineCounts = Object.fromEntries(ACTIVE_STATUSES.map((status) => [status, 0])) as Record<OrderStatus, number>;
    for (const row of pipeline) {
      pipelineCounts[row.status] = row._count._all;
    }

    const partnerCount = (status: DeliveryPartnerStatus) =>
      partners?.find((row) => row.status === status)?._count._all ?? 0;

    return {
      storeId: storeId ?? null,
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
      awaitingAssignment: pipelineCounts.READY_FOR_PICKUP,
      lowStock: { count: lowStock, threshold: LOW_STOCK_THRESHOLD },
      partners: partners && {
        online: partnerCount(DeliveryPartnerStatus.ONLINE),
        busy: partnerCount(DeliveryPartnerStatus.BUSY),
        offline: partnerCount(DeliveryPartnerStatus.OFFLINE),
      },
      customers,
      recentOrders: recent.map(({ total, ...order }) => ({ ...order, total: total.toFixed(2) })),
    };
  }

  return { getDashboard };
}
