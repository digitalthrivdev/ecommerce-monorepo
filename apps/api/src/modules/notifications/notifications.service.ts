import type { FastifyBaseLogger } from "fastify";

import type { OrderStatus, PrismaClient } from "../../generated/prisma/client";
import { orderNotifications, type OrderContext } from "./order-notifications.js";
import type { PushMessage, PushSender } from "./push-sender.js";
import type { RegisterPushTokenInput } from "./notifications.schemas.js";

const MAX_TOKENS_PER_USER = 10;
const BATCH_SIZE = 100;
/** Changes older than this (e.g. after downtime) are marked handled without sending stale pushes. */
const MAX_AGE_MS = 10 * 60 * 1000;

type ClaimedChange = {
  id: string;
  orderId: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  changedById: string | null;
  note: string | null;
  createdAt: Date;
};

export function createNotificationsService(prisma: PrismaClient, sender: PushSender | null, log: FastifyBaseLogger) {
  async function registerToken(userId: string, { token, platform }: RegisterPushTokenInput) {
    await prisma.$transaction(async (tx) => {
      await tx.pushToken.upsert({
        where: { token },
        create: { userId, token, platform },
        update: { userId, platform, updatedAt: new Date() },
      });

      const stale = await tx.pushToken.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        skip: MAX_TOKENS_PER_USER,
        select: { id: true },
      });
      if (stale.length > 0) {
        await tx.pushToken.deleteMany({ where: { id: { in: stale.map((row) => row.id) } } });
      }
    });
  }

  /** Only removes the token if it belongs to the caller; a no-op otherwise. */
  async function unregisterToken(userId: string, token: string) {
    await prisma.pushToken.deleteMany({ where: { userId, token } });
  }

  async function loadOrders(orderIds: string[]) {
    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: {
        id: true,
        orderNumber: true,
        userId: true,
        paymentMethod: true,
        store: { select: { name: true } },
        payment: { select: { status: true } },
        delivery: { select: { partner: { select: { userId: true } } } },
      },
    });

    return new Map(
      orders.map((order): [string, OrderContext] => [
        order.id,
        {
          id: order.id,
          orderNumber: order.orderNumber,
          userId: order.userId,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.payment?.status ?? null,
          storeName: order.store.name,
          partnerUserId: order.delivery?.partner?.userId ?? null,
        },
      ]),
    );
  }

  /**
   * Claims order status changes that have not been handled yet and sends their pushes. Claiming
   * is one atomic statement, so several API instances never send the same change twice, and only
   * committed changes are seen. A change is claimed before sending: a crash loses its pushes
   * rather than repeating them.
   */
  async function processPending() {
    const changes = await prisma.$queryRaw<ClaimedChange[]>`
      UPDATE "OrderStatusHistory" SET "notifiedAt" = now()
      WHERE id IN (
        SELECT id FROM "OrderStatusHistory"
        WHERE "notifiedAt" IS NULL
        ORDER BY "createdAt"
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, "orderId", "fromStatus", "toStatus", "changedById", note, "createdAt"
    `;

    const cutoff = Date.now() - MAX_AGE_MS;
    const fresh = changes
      .filter((change) => change.createdAt.getTime() >= cutoff)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    if (!sender || fresh.length === 0) {
      return { claimed: changes.length, sent: 0 };
    }

    const orders = await loadOrders([...new Set(fresh.map((change) => change.orderId))]);
    const notifications = fresh.flatMap((change) => {
      const order = orders.get(change.orderId);
      return order ? orderNotifications(change, order) : [];
    });

    if (notifications.length === 0) {
      return { claimed: changes.length, sent: 0 };
    }

    const tokens = await prisma.pushToken.findMany({
      where: { userId: { in: [...new Set(notifications.map((notification) => notification.userId))] } },
      select: { userId: true, token: true },
    });
    const messages: PushMessage[] = notifications.flatMap(({ userId, ...message }) =>
      tokens.filter((row) => row.userId === userId).map((row) => ({ ...message, token: row.token })),
    );

    if (messages.length === 0) {
      return { claimed: changes.length, sent: 0 };
    }

    try {
      const { invalidTokens } = await sender.send(messages);
      if (invalidTokens.length > 0) {
        await prisma.pushToken.deleteMany({ where: { token: { in: invalidTokens } } });
      }
    } catch (error) {
      log.error({ err: error, provider: sender.name, messages: messages.length }, "Failed to send push notifications");
      return { claimed: changes.length, sent: 0 };
    }

    return { claimed: changes.length, sent: messages.length };
  }

  return { registerToken, unregisterToken, processPending };
}

export type NotificationsService = ReturnType<typeof createNotificationsService>;
