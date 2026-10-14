import { OrderStatus, PaymentMethod, Prisma, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { couponDiscount } from "../coupons/coupons.service.js";
import { clearStockAsUnavailable } from "../inventory/inventory.service.js";
import type { PaymentsService } from "../payments/payments.service.js";
import { reviewAccountUserId } from "../settings/settings.service.js";
import { lockOrder, transitionOrder } from "./order-status.js";
import { orderDetailInclude, toDetailView } from "./orders.service.js";
import { discountShares, includedTax } from "./tax.js";

/** Fulfilment steps, moved on by staff or an admin. */
export const FULFILMENT_ACTIONS = {
  accept: { from: [OrderStatus.CONFIRMED], to: OrderStatus.STORE_ACCEPTED },
  "start-picking": { from: [OrderStatus.STORE_ACCEPTED], to: OrderStatus.PICKING },
  pack: { from: [OrderStatus.PICKING], to: OrderStatus.PACKED },
  ready: { from: [OrderStatus.PACKED], to: OrderStatus.READY_FOR_PICKUP },
} as const satisfies Record<string, { from: OrderStatus[]; to: OrderStatus }>;

/** Delivery steps, moved on by an admin. Delivering counts cash on delivery as collected. */
export const ADMIN_ACTIONS = {
  "out-for-delivery": { from: [OrderStatus.READY_FOR_PICKUP], to: OrderStatus.OUT_FOR_DELIVERY },
  "mark-delivered": { from: [OrderStatus.READY_FOR_PICKUP, OrderStatus.OUT_FOR_DELIVERY], to: OrderStatus.DELIVERED },
} as const satisfies Record<string, { from: OrderStatus[]; to: OrderStatus }>;

export type FulfilmentAction = keyof typeof FULFILMENT_ACTIONS;
export type AdminAction = keyof typeof ADMIN_ACTIONS;

const ORDER_ACTIONS = { ...FULFILMENT_ACTIONS, ...ADMIN_ACTIONS };

const STAFF_CANCELLABLE: OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.STORE_ACCEPTED,
  OrderStatus.PICKING,
  OrderStatus.PACKED,
  OrderStatus.READY_FOR_PICKUP,
];

/** Items can be marked unavailable until the order is packed. */
const ITEMS_EDITABLE: OrderStatus[] = [OrderStatus.STORE_ACCEPTED, OrderStatus.PICKING];

function hiddenStatuses(isAdmin: boolean) {
  return isAdmin ? [] : [OrderStatus.PENDING_PAYMENT];
}

// Admins can also cancel failed deliveries; the items come back, so stock is returned.
const ADMIN_ONLY_CANCELLABLE: OrderStatus[] = [OrderStatus.PENDING_PAYMENT, OrderStatus.OUT_FOR_DELIVERY];

function cancellableFrom(isAdmin: boolean) {
  return isAdmin ? [...STAFF_CANCELLABLE, ...ADMIN_ONLY_CANCELLABLE] : STAFF_CANCELLABLE;
}

function allowedActions(status: OrderStatus, isAdmin: boolean) {
  const actions: string[] = Object.entries(isAdmin ? ORDER_ACTIONS : FULFILMENT_ACTIONS)
    .filter(([, action]) => (action.from as readonly OrderStatus[]).includes(status))
    .map(([name]) => name);

  if (ITEMS_EDITABLE.includes(status)) {
    actions.push("mark-unavailable");
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

/** Orders as staff and admins manage them. Staff don't see orders still waiting for online payment. */
export function createManageOrdersService(prisma: PrismaClient, payments: PaymentsService) {
  async function listOrders(query: ListOrdersQuery, actor: Actor) {
    // Counts per status ignore the status filter so the UI can show them on filter tabs.
    const baseWhere: Prisma.OrderWhereInput = {
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
          userId: true,
          orderNumber: true,
          status: true,
          paymentMethod: true,
          total: true,
          customerName: true,
          customerPhone: true,
          createdAt: true,
          _count: { select: { items: true } },
          // Enough recent entries to skip "item not found" notes, which do not change the status.
          statusHistory: { orderBy: { createdAt: "desc" }, take: 5, select: { fromStatus: true, toStatus: true, createdAt: true } },
        },
      }),
      prisma.order.count({ where }),
      prisma.order.groupBy({ by: ["status"], where: baseWhere, orderBy: { status: "asc" }, _count: { _all: true } }),
    ]);
    const reviewUserId = await reviewAccountUserId(prisma);

    return {
      items: orders.map(({ _count, total: orderTotal, statusHistory, userId, ...order }) => ({
        ...order,
        reviewAccount: userId === reviewUserId,
        total: orderTotal.toFixed(2),
        itemCount: _count.items,
        /** When the order reached its current status, for "waiting 8 min" timers. */
        statusChangedAt:
          statusHistory.find((entry) => entry.toStatus === order.status && entry.fromStatus !== entry.toStatus)?.createdAt ?? order.createdAt,
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

  async function getOrder(orderId: string, actor: Actor) {
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        ...(!actor.isAdmin && { status: { not: OrderStatus.PENDING_PAYMENT } }),
      },
      include: orderDetailInclude,
    });

    if (!order) {
      throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
    }

    const actorIds = [...new Set(order.statusHistory.map((entry) => entry.changedById).filter((id) => id !== null))];
    const [actors, reviewUserId] = await Promise.all([
      actorIds.length
        ? prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, role: true } })
        : [],
      reviewAccountUserId(prisma),
    ]);
    const actorById = new Map(actors.map(({ id, ...user }) => [id, user]));

    const { canCancel: _customerCanCancel, canReportIssue: _canReportIssue, canRate: _canRate, ...view } = toDetailView(order);
    const refundable = actor.isAdmin ? payments.refundableAmount(order, order.payment) : new Prisma.Decimal(0);
    return {
      ...view,
      reviewAccount: order.userId === reviewUserId,
      statusHistory: order.statusHistory.map(({ changedById, ...entry }) => ({
        ...entry,
        changedBy: changedById ? (actorById.get(changedById) ?? null) : null,
      })),
      refunds: order.refunds.map(({ amount, createdBy, ...refund }) => ({
        ...refund,
        amount: amount.toFixed(2),
        createdBy: createdBy?.name ?? null,
      })),
      refundable: refundable.toFixed(2),
      allowedActions: [...allowedActions(order.status, actor.isAdmin), ...(refundable.gt(0) ? ["refund"] : [])],
    };
  }

  /** Admin actions are admin-only; enforced by the route. */
  async function performAction(orderId: string, action: FulfilmentAction | AdminAction, actor: Actor, note?: string) {
    const { from, to } = ORDER_ACTIONS[action];

    await prisma.$transaction((tx) =>
      transitionOrder(tx, {
        orderId,
        hiddenStatuses: hiddenStatuses(actor.isAdmin),
        allowedFrom: [...from],
        to,
        changedById: actor.userId,
        note,
      }),
    );

    return getOrder(orderId, actor);
  }

  async function cancelOrder(orderId: string, actor: Actor, reason: string) {
    await prisma.$transaction((tx) =>
      transitionOrder(tx, {
        orderId,
        hiddenStatuses: hiddenStatuses(actor.isAdmin),
        allowedFrom: cancellableFrom(actor.isAdmin),
        to: OrderStatus.CANCELLED,
        changedById: actor.userId,
        note: reason,
        notAllowed: { code: "ORDER_NOT_CANCELLABLE", message: "This order can no longer be cancelled" },
      }),
    );
    await payments.settleCancelledOrder(orderId);

    return getOrder(orderId, actor);
  }

  /**
   * Removes units staff cannot find from the order. The bill is recalculated (the delivery fee
   * is kept as charged), the product's stock is set to 0 because the shelf is empty, and online
   * payments are refunded the difference. quantity defaults to every remaining unit of the item.
   */
  async function markItemUnavailable(
    orderId: string,
    itemId: string,
    quantity: number | undefined,
    actor: Actor,
  ) {
    await prisma.$transaction(async (tx) => {
      const locked = await lockOrder(tx, orderId, undefined, hiddenStatuses(actor.isAdmin));
      if (!ITEMS_EDITABLE.includes(locked.status)) {
        throw new AppError(409, "ORDER_ITEMS_LOCKED", "Items can only be marked unavailable before the order is packed", {
          status: locked.status,
        });
      }

      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        select: {
          orderNumber: true,
          deliveryFee: true,
          deliveryFeeTax: true,
          discount: true,
          paymentMethod: true,
          items: true,
          coupon: { select: { discountType: true, discountValue: true, maxDiscount: true } },
        },
      });
      const item = order.items.find((candidate) => candidate.id === itemId);
      if (!item) {
        throw new AppError(404, "ORDER_ITEM_NOT_FOUND", "Item not found in this order");
      }

      const remaining = item.quantity - item.unavailableQuantity;
      if (remaining === 0) {
        throw new AppError(409, "ITEM_ALREADY_UNAVAILABLE", "This item is already marked unavailable");
      }
      const units = quantity ?? remaining;
      if (units > remaining) {
        throw new AppError(400, "INVALID_QUANTITY", `Only ${remaining} of this item ${remaining === 1 ? "is" : "are"} left to mark`);
      }

      const items = order.items.map((candidate) =>
        candidate.id === itemId ? { ...candidate, unavailableQuantity: candidate.unavailableQuantity + units } : candidate,
      );
      if (items.every((candidate) => candidate.unavailableQuantity === candidate.quantity)) {
        throw new AppError(409, "ORDER_WOULD_BE_EMPTY", "Every item would be unavailable. Cancel the order instead.");
      }

      const amounts = items.map((candidate) => candidate.unitPrice.mul(candidate.quantity - candidate.unavailableQuantity));
      const subtotal = amounts.reduce((sum, amount) => sum.plus(amount), new Prisma.Decimal(0));
      // The coupon is recalculated on what's left; its minimum order no longer applies, since the shop is short.
      const discount = order.coupon ? couponDiscount(subtotal, order.coupon) : Prisma.Decimal.min(order.discount, subtotal);
      const total = Prisma.Decimal.max(subtotal.plus(order.deliveryFee).minus(discount), 0);
      const shares = discountShares(amounts, discount);
      const repriced = items.map((candidate, index) => ({
        id: candidate.id,
        changed: candidate.id === itemId || !candidate.discount.eq(shares[index]!),
        discount: shares[index]!,
        taxAmount: includedTax(amounts[index]!.minus(shares[index]!), candidate.gstRate),
      }));
      const taxTotal = repriced.reduce((sum, line) => sum.plus(line.taxAmount), order.deliveryFeeTax);

      for (const line of repriced.filter((candidate) => candidate.changed)) {
        await tx.orderItem.update({
          where: { id: line.id },
          data: { discount: line.discount, taxAmount: line.taxAmount, ...(line.id === itemId && { unavailableQuantity: { increment: units } }) },
        });
      }
      await tx.order.update({ where: { id: orderId }, data: { subtotal, discount, total, taxTotal } });
      if (order.paymentMethod === PaymentMethod.COD) {
        await tx.payment.updateMany({ where: { orderId }, data: { amount: total } });
      }
      await clearStockAsUnavailable(tx, item.variantId, {
        note: `Order ${order.orderNumber}: ${units} × ${item.productName}${item.variantName ? ` (${item.variantName})` : ""} not found`,
        changedById: actor.userId,
      });
      // Same from and to status: an item change, not a step. Kept for the audit trail and the customer push.
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: locked.status,
          toStatus: locked.status,
          changedById: actor.userId,
          note: `${units} × ${item.productName}${item.variantName ? ` (${item.variantName})` : ""} unavailable`,
        },
      });
    });

    await payments.settleReducedOrder(orderId);

    return getOrder(orderId, actor);
  }

  return { listOrders, getOrder, performAction, cancelOrder, markItemUnavailable };
}
