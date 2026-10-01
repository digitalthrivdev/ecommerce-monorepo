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

function cancellableFrom(isAdmin: boolean) {
  return isAdmin ? [OrderStatus.PENDING_PAYMENT, ...STORE_CANCELLABLE] : STORE_CANCELLABLE;
}

function allowedActions(status: OrderStatus, isAdmin: boolean) {
  const actions: string[] = Object.entries(STORE_ACTIONS)
    .filter(([, action]) => (action.from as readonly OrderStatus[]).includes(status))
    .map(([name]) => name);

  if (cancellableFrom(isAdmin).includes(status)) {
    actions.push("cancel");
  }

  return actions;
}

type Actor = { userId: string; isAdmin: boolean };

export function createStoreOrdersService(prisma: PrismaClient, payments: PaymentsService) {
  async function listOrders(
    storeId: string,
    query: { limit: number; offset: number; status?: OrderStatus; sort: "newest" | "oldest" },
    actor: Actor,
  ) {
    const where: Prisma.OrderWhereInput = {
      storeId,
      AND: [
        query.status ? { status: query.status } : {},
        actor.isAdmin ? {} : { status: { not: OrderStatus.PENDING_PAYMENT } },
      ],
    };

    const [orders, total] = await prisma.$transaction([
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
          createdAt: true,
          _count: { select: { items: true } },
        },
      }),
      prisma.order.count({ where }),
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
    };
  }

  async function getOrder(storeId: string, orderId: string, actor: Actor) {
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        storeId,
        ...(!actor.isAdmin && { status: { not: OrderStatus.PENDING_PAYMENT } }),
      },
      include: orderDetailInclude,
    });

    if (!order) {
      throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
    }

    const { canCancel: _customerCanCancel, ...view } = toDetailView(order);
    return { ...view, allowedActions: allowedActions(order.status, actor.isAdmin) };
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
