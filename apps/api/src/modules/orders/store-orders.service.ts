import { OrderStatus, type Prisma, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import type { PaymentsService } from "../payments/payments.service.js";
import { transitionOrder } from "./order-status.js";
import { orderDetailInclude, toDetailView } from "./orders.service.js";

export const STORE_ACTIONS = {
  accept: { from: [OrderStatus.CONFIRMED], to: OrderStatus.STORE_ACCEPTED },
  "start-picking": { from: [OrderStatus.STORE_ACCEPTED], to: OrderStatus.PICKING },
  pack: { from: [OrderStatus.PICKING], to: OrderStatus.PACKED },
  ready: { from: [OrderStatus.PACKED], to: OrderStatus.READY_FOR_PICKUP },
} as const satisfies Record<string, { from: OrderStatus[]; to: OrderStatus }>;

export type StoreAction = keyof typeof STORE_ACTIONS;

const STORE_CANCELLABLE: OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.STORE_ACCEPTED,
  OrderStatus.PICKING,
  OrderStatus.PACKED,
  OrderStatus.READY_FOR_PICKUP,
];

function hiddenStatuses(isAdmin: boolean) {
  return isAdmin ? [] : [OrderStatus.PENDING_PAYMENT];
}

// Admins can also cancel failed deliveries; the rider brings the items back, so stock is returned.
const ADMIN_ONLY_CANCELLABLE: OrderStatus[] = [
  OrderStatus.PENDING_PAYMENT,
  OrderStatus.ASSIGNED,
  OrderStatus.PICKED_UP,
  OrderStatus.OUT_FOR_DELIVERY,
];

function cancellableFrom(isAdmin: boolean) {
  return isAdmin ? [...STORE_CANCELLABLE, ...ADMIN_ONLY_CANCELLABLE] : STORE_CANCELLABLE;
}

function allowedActions(status: OrderStatus, isAdmin: boolean) {
  const actions: string[] = Object.entries(STORE_ACTIONS)
    .filter(([, action]) => (action.from as readonly OrderStatus[]).includes(status))
    .map(([name]) => name);

  if (isAdmin && status === OrderStatus.READY_FOR_PICKUP) {
    actions.push("assign");
  }
  if (isAdmin && status === OrderStatus.ASSIGNED) {
    actions.push("reassign");
  }

  if (cancellableFrom(isAdmin).includes(status)) {
    actions.push("cancel");
  }

  return actions;
}

type Actor = { userId: string; isAdmin: boolean };

export type ListOrdersQuery = {
  limit: number;
  offset: number;
  status?: OrderStatus[];
  q?: string;
  sort: "newest" | "oldest";
};

function searchFilter(q: string | undefined): Prisma.OrderWhereInput {
  if (!q) return {};
  return {
    OR: [
      { orderNumber: { contains: q, mode: "insensitive" } },
      { customerPhone: { contains: q } },
      { customerName: { contains: q, mode: "insensitive" } },
    ],
  };
}

export function createStoreOrdersService(prisma: PrismaClient, payments: PaymentsService) {
  /** storeId undefined lists every store (admin only; enforced by the route). */
  async function listOrders(storeId: string | undefined, query: ListOrdersQuery, actor: Actor) {
    // Counts per status ignore the status filter so the UI can show them on filter tabs.
    const baseWhere: Prisma.OrderWhereInput = {
      ...(storeId && { storeId }),
      AND: [searchFilter(query.q), actor.isAdmin ? {} : { status: { not: OrderStatus.PENDING_PAYMENT } }],
    };
    const where: Prisma.OrderWhereInput = {
      AND: [baseWhere, query.status ? { status: { in: query.status } } : {}],
    };

    const [orders, total, counts] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: query.sort === "oldest" ? "asc" : "desc" },
        take: query.limit,
        skip: query.offset,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentMethod: true,
          total: true,
          customerName: true,
          customerPhone: true,
          createdAt: true,
          store: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
      }),
      prisma.order.count({ where }),
      prisma.order.groupBy({ by: ["status"], where: baseWhere, orderBy: { status: "asc" }, _count: { _all: true } }),
    ]);

    return {
      items: orders.map(({ _count, total: orderTotal, ...order }) => ({
        ...order,
        total: orderTotal.toFixed(2),
        itemCount: _count.items,
        allowedActions: allowedActions(order.status, actor.isAdmin),
      })),
      total,
      limit: query.limit,
      offset: query.offset,
      statusCounts: Object.fromEntries(counts.map((row) => [row.status, row._count._all])) as Partial<
        Record<OrderStatus, number>
      >,
    };
  }

  /** storeId undefined finds the order in any store (admin only; enforced by the route). */
  async function getOrder(storeId: string | undefined, orderId: string, actor: Actor) {
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        ...(storeId && { storeId }),
        ...(!actor.isAdmin && { status: { not: OrderStatus.PENDING_PAYMENT } }),
      },
      include: orderDetailInclude,
    });

    if (!order) {
      throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
    }

    const actorIds = [...new Set(order.statusHistory.map((entry) => entry.changedById).filter((id) => id !== null))];
    const actors = actorIds.length
      ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, role: true } })
      : [];
    const actorById = new Map(actors.map(({ id, ...user }) => [id, user]));

    const { canCancel: _customerCanCancel, ...view } = toDetailView(order);
    return {
      ...view,
      statusHistory: order.statusHistory.map(({ changedById, ...entry }) => ({
        ...entry,
        changedBy: changedById ? (actorById.get(changedById) ?? null) : null,
      })),
      allowedActions: allowedActions(order.status, actor.isAdmin),
    };
  }

  async function performAction(storeId: string, orderId: string, action: StoreAction, actor: Actor, note?: string) {
    const { from, to } = STORE_ACTIONS[action];

    await prisma.$transaction((tx) =>
      transitionOrder(tx, {
        orderId,
        scope: { storeId },
        hiddenStatuses: hiddenStatuses(actor.isAdmin),
        allowedFrom: [...from],
        to,
        changedById: actor.userId,
        note,
      }),
    );

    return getOrder(storeId, orderId, actor);
  }

  async function cancelOrder(storeId: string, orderId: string, actor: Actor, reason: string) {
    await prisma.$transaction((tx) =>
      transitionOrder(tx, {
        orderId,
        scope: { storeId },
        hiddenStatuses: hiddenStatuses(actor.isAdmin),
        allowedFrom: cancellableFrom(actor.isAdmin),
        to: OrderStatus.CANCELLED,
        changedById: actor.userId,
        note: reason,
        notAllowed: { code: "ORDER_NOT_CANCELLABLE", message: "This order can no longer be cancelled" },
      }),
    );
    await payments.settleCancelledOrder(orderId);

    return getOrder(storeId, orderId, actor);
  }

  return { listOrders, getOrder, performAction, cancelOrder };
}
