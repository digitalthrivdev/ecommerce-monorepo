import { OrderStatus, PaymentMethod, PaymentStatus, Prisma } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { releaseStock } from "../inventory/inventory.service.js";
import { assignInvoiceNumber } from "./tax.js";

type Tx = Prisma.TransactionClient;

/** Paid orders that are still being prepared or are on their way. */
export const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.PACKED,
  OrderStatus.SHIPPED,
  OrderStatus.IN_TRANSIT,
  OrderStatus.OUT_FOR_DELIVERY,
];

/** When the order was delivered, from its status history. */
export function deliveredAt(statusHistory: { toStatus: OrderStatus; createdAt: Date }[]) {
  return statusHistory.find((entry) => entry.toStatus === OrderStatus.DELIVERED)?.createdAt ?? null;
}

/** Selects only the DELIVERED entry, for `deliveredAt`. */
export const deliveredEntry = {
  where: { toStatus: OrderStatus.DELIVERED },
  take: 1,
  select: { toStatus: true, createdAt: true },
} satisfies Prisma.Order$statusHistoryArgs;

type TransitionParams = {
  orderId: string;
  /** Omit only for system changes (payments, expiry) that are not made on behalf of a caller. */
  scope?: { userId: string };
  /** Orders in these statuses are treated as not found for this caller. */
  hiddenStatuses?: OrderStatus[];
  allowedFrom: OrderStatus[];
  to: OrderStatus;
  /** Null for system changes. */
  changedById: string | null;
  note?: string | null;
  notAllowed?: { code: string; message: string };
};

async function releaseOrderStock(tx: Tx, orderId: string) {
  const items = await tx.orderItem.findMany({
    where: { orderId },
    select: { variantId: true, quantity: true, unavailableQuantity: true },
  });
  await releaseStock(
    tx,
    // Units marked unavailable were never on the shelf, so only the picked units go back.
    items.flatMap((item) => {
      const quantity = item.quantity - item.unavailableQuantity;
      return quantity > 0 ? [{ variantId: item.variantId, quantity }] : [];
    }),
  );
}

/**
 * Locks the order row (404 if it is outside the caller's scope). Anything that changes an order
 * locks it first, so concurrent changes are serialised in the same order.
 */
export async function lockOrder(
  tx: Tx,
  orderId: string,
  scope?: TransitionParams["scope"],
  hiddenStatuses?: OrderStatus[],
) {
  const scopeFilter = scope ? Prisma.sql`AND "userId" = ${scope.userId}` : Prisma.empty;

  const [locked] = await tx.$queryRaw<{ status: OrderStatus }[]>`
    SELECT status FROM "Order" WHERE id = ${orderId} ${scopeFilter} FOR UPDATE
  `;

  if (!locked || hiddenStatuses?.includes(locked.status)) {
    throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
  }

  return locked;
}

/**
 * Locks the order row, checks the current status, applies the change and records it in the
 * status history. Cancelling returns the order's stock, packing assigns the invoice number, and
 * delivering counts cash on delivery as collected. Must run inside a transaction.
 */
export async function transitionOrder(tx: Tx, params: TransitionParams) {
  const locked = await lockOrder(tx, params.orderId, params.scope, params.hiddenStatuses);

  if (!params.allowedFrom.includes(locked.status)) {
    throw new AppError(
      409,
      params.notAllowed?.code ?? "INVALID_STATUS_TRANSITION",
      params.notAllowed?.message ?? `Cannot move an order from ${locked.status} to ${params.to}`,
      { status: locked.status, allowedFrom: params.allowedFrom },
    );
  }

  if (params.to === OrderStatus.CANCELLED) {
    await releaseOrderStock(tx, params.orderId);
  }

  if (params.to === OrderStatus.PACKED) {
    await assignInvoiceNumber(tx, params.orderId);
  }

  if (params.to === OrderStatus.DELIVERED) {
    await tx.payment.updateMany({
      where: { orderId: params.orderId, method: PaymentMethod.COD, status: PaymentStatus.PENDING },
      data: { status: PaymentStatus.PAID, paidAt: new Date(), provider: "cash" },
    });
  }

  await tx.order.update({ where: { id: params.orderId }, data: { status: params.to } });
  await tx.orderStatusHistory.create({
    data: {
      orderId: params.orderId,
      fromStatus: locked.status,
      toStatus: params.to,
      changedById: params.changedById,
      note: params.note ?? null,
    },
  });

  return { fromStatus: locked.status };
}
