import type { IncomingHttpHeaders } from "node:http";

import type { FastifyBaseLogger } from "fastify";

import { env } from "../../config/env.js";
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  type PrismaClient,
} from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { transitionOrder } from "../orders/order-status.js";
import type { PaymentEvent, PaymentProvider } from "./payment-provider.js";

const PAYMENT_TIMEOUT_MS = env.PAYMENT_TIMEOUT_MINUTES * 60_000;
const SWEEP_BATCH_SIZE = 100;
const UNPAID_STATUSES: PaymentStatus[] = [PaymentStatus.PENDING, PaymentStatus.PROCESSING];

export function paymentDeadline(createdAt: Date) {
  return new Date(createdAt.getTime() + PAYMENT_TIMEOUT_MS);
}

export type PaymentsService = ReturnType<typeof createPaymentsService>;

export function createPaymentsService(
  prisma: PrismaClient,
  provider: PaymentProvider | null,
  log: FastifyBaseLogger,
) {
  function requireProvider() {
    if (!provider) {
      throw new AppError(409, "ONLINE_PAYMENTS_DISABLED", "Online payments are not available");
    }
    return provider;
  }

  async function findOnlineOrder(userId: string, orderId: string) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentMethod: true,
        createdAt: true,
        payment: { select: { id: true, status: true, amount: true, providerOrderId: true, transactionId: true } },
      },
    });

    if (!order?.payment) {
      throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
    }
    if (order.paymentMethod !== PaymentMethod.ONLINE) {
      throw new AppError(409, "PAYMENT_NOT_ONLINE", "This order is paid by cash on delivery");
    }

    return { ...order, payment: order.payment };
  }

  async function startPayment(userId: string, orderId: string) {
    const paymentProvider = requireProvider();
    const order = await findOnlineOrder(userId, orderId);
    const { payment } = order;

    if (payment.status === PaymentStatus.PAID || payment.status === PaymentStatus.REFUNDED) {
      throw new AppError(409, "ALREADY_PAID", "This order has already been paid");
    }
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new AppError(409, "PAYMENT_NOT_ALLOWED", "This order is no longer awaiting payment", {
        status: order.status,
      });
    }

    const expiresAt = paymentDeadline(order.createdAt);
    if (expiresAt <= new Date()) {
      throw new AppError(409, "PAYMENT_EXPIRED", "The time to pay for this order has run out");
    }

    let providerOrderId = payment.providerOrderId;
    if (!providerOrderId) {
      const created = await paymentProvider.createOrder({
        amount: payment.amount,
        currency: env.CURRENCY,
        receipt: order.orderNumber,
      });
      // Two concurrent starts may both create a provider order; only the first one is kept.
      const claimed = await prisma.payment.updateMany({
        where: { id: payment.id, providerOrderId: null },
        data: { providerOrderId: created.providerOrderId, provider: paymentProvider.name },
      });
      providerOrderId =
        claimed.count === 1
          ? created.providerOrderId
          : (await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).providerOrderId!;
    }

    await prisma.payment.updateMany({
      where: { id: payment.id, status: { in: [PaymentStatus.PENDING, PaymentStatus.FAILED] } },
      data: { status: PaymentStatus.PROCESSING, failureReason: null },
    });

    return {
      orderId: order.id,
      provider: paymentProvider.name,
      providerOrderId,
      amount: payment.amount.toFixed(2),
      currency: env.CURRENCY,
      expiresAt,
      checkout: paymentProvider.checkoutOptions(providerOrderId),
    };
  }

  async function verifyPayment(
    userId: string,
    orderId: string,
    input: { providerPaymentId: string; signature: string },
  ) {
    const paymentProvider = requireProvider();
    const { payment } = await findOnlineOrder(userId, orderId);

    if (!payment.providerOrderId) {
      throw new AppError(409, "PAYMENT_NOT_STARTED", "Payment has not been started for this order");
    }

    const valid = paymentProvider.verifyCheckout({ providerOrderId: payment.providerOrderId, ...input });
    if (!valid) {
      throw new AppError(400, "INVALID_PAYMENT_SIGNATURE", "Payment could not be verified");
    }

    await recordCapture(payment.providerOrderId, input.providerPaymentId);
  }

  /** Idempotent: the app's verify call and the provider's webhook can both report the same payment. */
  async function recordCapture(providerOrderId: string, providerPaymentId: string) {
    const ref = await prisma.payment.findUnique({
      where: { providerOrderId },
      select: { id: true, orderId: true },
    });

    if (!ref) {
      log.warn({ providerOrderId }, "Captured payment for an unknown provider order");
      return;
    }

    const refundNeeded = await prisma.$transaction(async (tx) => {
      const [order] = await tx.$queryRaw<{ status: OrderStatus }[]>`
        SELECT status FROM "Order" WHERE id = ${ref.orderId} FOR UPDATE
      `;
      const payment = await tx.payment.findUniqueOrThrow({
        where: { id: ref.id },
        select: { status: true, transactionId: true },
      });

      if (payment.status === PaymentStatus.PAID || payment.status === PaymentStatus.REFUNDED) {
        if (payment.transactionId !== providerPaymentId) {
          log.error(
            { orderId: ref.orderId, providerOrderId, providerPaymentId, existing: payment.transactionId },
            "Second payment captured for an already paid order; refund it manually",
          );
        }
        return false;
      }

      await tx.payment.update({
        where: { id: ref.id },
        data: {
          status: PaymentStatus.PAID,
          transactionId: providerPaymentId,
          paidAt: new Date(),
          failureReason: null,
        },
      });

      if (order!.status === OrderStatus.PENDING_PAYMENT) {
        await transitionOrder(tx, {
          orderId: ref.orderId,
          allowedFrom: [OrderStatus.PENDING_PAYMENT],
          to: OrderStatus.CONFIRMED,
          changedById: null,
          note: "Payment received",
        });
        return false;
      }

      return order!.status === OrderStatus.CANCELLED;
    });

    if (refundNeeded) {
      await refundSafely(ref.orderId);
    }
  }

  async function recordFailure(providerOrderId: string, reason: string) {
    await prisma.payment.updateMany({
      where: { providerOrderId, status: { in: UNPAID_STATUSES } },
      data: { status: PaymentStatus.FAILED, failureReason: reason.slice(0, 300) },
    });
  }

  async function handleEvent(event: PaymentEvent) {
    switch (event.type) {
      case "payment.captured":
        return recordCapture(event.providerOrderId, event.providerPaymentId);
      case "payment.failed":
        return recordFailure(event.providerOrderId, event.reason);
      case "ignored":
        return;
    }
  }

  async function handleWebhook(providerName: string, rawBody: string, headers: IncomingHttpHeaders) {
    if (!provider || provider.name !== providerName) {
      throw new AppError(404, "NOT_FOUND", "Unknown payment provider");
    }

    const event = provider.parseWebhook(rawBody, headers);
    if (!event) {
      throw new AppError(401, "INVALID_WEBHOOK_SIGNATURE", "Webhook signature is invalid");
    }

    await handleEvent(event);
  }

  /**
   * Refunds a paid online payment whose order is cancelled. The payment row stays locked during the
   * provider call so concurrent callers cannot refund twice.
   */
  async function refundOrderPayment(orderId: string) {
    const paymentProvider = requireProvider();

    return prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Payment" WHERE "orderId" = ${orderId} FOR UPDATE`;
        const payment = await tx.payment.findUnique({
          where: { orderId },
          include: { order: { select: { status: true } } },
        });

        if (
          !payment ||
          payment.method !== PaymentMethod.ONLINE ||
          payment.status !== PaymentStatus.PAID ||
          !payment.transactionId ||
          payment.order.status !== OrderStatus.CANCELLED
        ) {
          return false;
        }

        const { providerRefundId } = await paymentProvider.refund({
          providerPaymentId: payment.transactionId,
          amount: payment.amount,
          idempotencyKey: payment.id,
        });

        await tx.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.REFUNDED, providerRefundId, refundedAt: new Date() },
        });
        return true;
      },
      { timeout: 20_000 },
    );
  }

  async function refundSafely(orderId: string) {
    try {
      await refundOrderPayment(orderId);
    } catch (error) {
      log.error({ err: error, orderId }, "Refund failed; it will be retried by the payment sweep");
    }
  }

  /** Call after an order is cancelled: closes an unpaid online payment or refunds a paid one. */
  async function settleCancelledOrder(orderId: string) {
    await prisma.payment.updateMany({
      where: { orderId, method: PaymentMethod.ONLINE, status: { in: UNPAID_STATUSES } },
      data: { status: PaymentStatus.FAILED, failureReason: "Order cancelled before payment" },
    });
    await refundSafely(orderId);
  }

  /** Cancels expired unpaid online orders (returning their stock) and retries failed refunds. */
  async function sweep() {
    const cutoff = new Date(Date.now() - PAYMENT_TIMEOUT_MS);
    const expiredOrders = await prisma.order.findMany({
      where: { status: OrderStatus.PENDING_PAYMENT, createdAt: { lt: cutoff } },
      orderBy: { createdAt: "asc" },
      take: SWEEP_BATCH_SIZE,
      select: { id: true },
    });

    let expired = 0;
    for (const { id } of expiredOrders) {
      try {
        await prisma.$transaction(async (tx) => {
          await transitionOrder(tx, {
            orderId: id,
            allowedFrom: [OrderStatus.PENDING_PAYMENT],
            to: OrderStatus.CANCELLED,
            changedById: null,
            note: "Payment not completed in time",
          });
          await tx.payment.updateMany({
            where: { orderId: id, status: { in: [...UNPAID_STATUSES, PaymentStatus.FAILED] } },
            data: { status: PaymentStatus.FAILED, failureReason: "Payment window expired" },
          });
        });
        expired++;
      } catch (error) {
        // 409: the order was paid or cancelled after it was selected.
        if (!(error instanceof AppError && error.statusCode === 409)) {
          log.error({ err: error, orderId: id }, "Failed to expire unpaid order");
        }
      }
    }

    const pendingRefunds = await prisma.payment.findMany({
      where: {
        method: PaymentMethod.ONLINE,
        status: PaymentStatus.PAID,
        order: { status: OrderStatus.CANCELLED },
      },
      take: SWEEP_BATCH_SIZE,
      select: { orderId: true },
    });

    let refunded = 0;
    for (const { orderId } of pendingRefunds) {
      try {
        if (await refundOrderPayment(orderId)) {
          refunded++;
        }
      } catch (error) {
        log.error({ err: error, orderId }, "Refund retry failed");
      }
    }

    return { expired, refunded, refundsPending: pendingRefunds.length - refunded };
  }

  return {
    startPayment,
    verifyPayment,
    handleEvent,
    handleWebhook,
    settleCancelledOrder,
    sweep,
  };
}
