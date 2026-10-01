import { OrderStatus, Prisma } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { releaseStock } from "../inventory/inventory.service.js";

type Tx = Prisma.TransactionClient;

type TransitionParams = {
  orderId: string;
  scope: { userId: string } | { storeId: string };
  /** Orders in these statuses are treated as not found for this caller. */
  hiddenStatuses?: OrderStatus[];
  allowedFrom: OrderStatus[];
  to: OrderStatus;
  changedById: string;
  note?: string | null;
  notAllowed?: { code: string; message: string };
};

async function releaseOrderStock(tx: Tx, orderId: string, storeId: string) {
  const items = await tx.orderItem.findMany({
    where: { orderId },
    select: { productId: true, quantity: true },
  });
  const storeProducts = await tx.storeProduct.findMany({
    where: { storeId, productId: { in: items.map((item) => item.productId) } },
    select: { id: true, productId: true },
  });
  const storeProductIdByProductId = new Map(storeProducts.map((sp) => [sp.productId, sp.id]));

  await releaseStock(
    tx,
    items.flatMap((item) => {
      const storeProductId = storeProductIdByProductId.get(item.productId);
      return storeProductId ? [{ storeProductId, quantity: item.quantity }] : [];
    }),
  );
}

/**
 * Locks the order row, checks the current status, applies the change and records it in the
 * status history. Cancelling returns the order's stock. Must run inside a transaction.
 */
export async function transitionOrder(tx: Tx, params: TransitionParams) {
  const scopeFilter =
    "userId" in params.scope
      ? Prisma.sql`AND "userId" = ${params.scope.userId}`
      : Prisma.sql`AND "storeId" = ${params.scope.storeId}`;

  const [locked] = await tx.$queryRaw<{ status: OrderStatus; storeId: string }[]>`
    SELECT status, "storeId" FROM "Order" WHERE id = ${params.orderId} ${scopeFilter} FOR UPDATE
  `;

  if (!locked || params.hiddenStatuses?.includes(locked.status)) {
    throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
  }

  if (!params.allowedFrom.includes(locked.status)) {
    throw new AppError(
      409,
      params.notAllowed?.code ?? "INVALID_STATUS_TRANSITION",
      params.notAllowed?.message ?? `Cannot move an order from ${locked.status} to ${params.to}`,
      { status: locked.status, allowedFrom: params.allowedFrom },
    );
  }

  if (params.to === OrderStatus.CANCELLED) {
    await releaseOrderStock(tx, params.orderId, locked.storeId);
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

  return { fromStatus: locked.status, storeId: locked.storeId };
}
