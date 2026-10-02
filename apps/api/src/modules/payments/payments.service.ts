import type { IncomingHttpHeaders } from "node:http";

import type { FastifyBaseLogger } from "fastify";
import type Redis from "ioredis";

import { env } from "../../config/env.js";
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  type PrismaClient,
} from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { transitionOrder } from "../orders/order-status.js";
import { getAppearance } from "../settings/appearance.service.js";
import { getPlatformSettings } from "../settings/settings.service.js";
import { createCheckoutToken, readCheckoutToken } from "./checkout-token.js";
import { escapeHtml, paymentPage, scriptJson, toMinorUnits } from "./gateway-helpers.js";
import { activePaymentProvider, getPaymentProvider } from "./gateway-registry.js";
import type { PaymentEvent, PaymentProvider } from "./payment-provider.js";

const PAYMENT_TIMEOUT_MS = env.PAYMENT_TIMEOUT_MINUTES * 60_000;
const SWEEP_BATCH_SIZE = 100;
const UNPAID_STATUSES: PaymentStatus[] = [PaymentStatus.PENDING, PaymentStatus.PROCESSING];

export function paymentDeadline(createdAt: Date) {
  return new Date(createdAt.getTime() + PAYMENT_TIMEOUT_MS);
}

/** Where the customer's browser lands after checkout: back in the app, with how the payment ended. */
export type PaymentResult = "success" | "failed" | "cancelled" | "pending";

/** A page for the customer's browser. */
export type BrowserResponse = { html: string; status: number };

const appReturnKey = (paymentId: string) => `payment:app-return:${paymentId}`;

const paymentSelect = {
  id: true,
  status: true,
  amount: true,
  provider: true,
  providerOrderId: true,
  order: {
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentMethod: true,
      createdAt: true,
      userId: true,
      customerName: true,
      customerPhone: true,
      user: { select: { email: true } },
    },
  },
} satisfies Prisma.PaymentSelect;

type PaymentWithOrder = Prisma.PaymentGetPayload<{ select: typeof paymentSelect }>;

export type PaymentsService = ReturnType<typeof createPaymentsService>;

export function createPaymentsService(prisma: PrismaClient, redis: Redis, log: FastifyBaseLogger) {
  function providerFor(name: string | null) {
    return getPaymentProvider(prisma, name);
  }

  function checkoutUrls(baseUrl: string, provider: PaymentProvider, payment: PaymentWithOrder) {
    const token = createCheckoutToken(payment.id, paymentDeadline(payment.order.createdAt));
    return {
      checkoutUrl: `${baseUrl}/payments/checkout/${token}`,
      returnUrl: `${baseUrl}/payments/return/${provider.name}/${token}`,
      // Gateways only call webhooks on public https URLs.
      notifyUrl: baseUrl.startsWith("https://") ? `${baseUrl}/payments/webhooks/${provider.name}` : undefined,
    };
  }

  function customerOf(payment: PaymentWithOrder) {
    const { order } = payment;
    return { id: order.userId, name: order.customerName, phone: order.customerPhone, email: order.user.email };
  }

  /**
   * Prepares the hosted checkout for an unpaid online order. A payment keeps the gateway it was
   * started on (so switching gateways never strands it) unless that gateway is no longer configured.
   */
  async function startPayment(userId: string, orderId: string, input: { appReturnUrl: string; baseUrl: string }) {
    const payment = await prisma.payment.findFirst({
      where: { orderId, order: { userId } },
      select: paymentSelect,
    });

    if (!payment) {
      throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
    }
    const { order } = payment;
    if (order.paymentMethod !== PaymentMethod.ONLINE) {
      throw new AppError(409, "PAYMENT_NOT_ONLINE", "This order is paid by cash on delivery");
    }
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

    const existing = payment.providerOrderId ? await providerFor(payment.provider) : null;
    const provider = existing ?? (await activePaymentProvider(prisma, await getPlatformSettings(prisma)));
    if (!provider) {
      throw new AppError(409, "ONLINE_PAYMENTS_DISABLED", "Online payments are not available right now");
    }

    const urls = checkoutUrls(input.baseUrl, provider, payment);

    if (!existing) {
      const created = await provider.createOrder({
        amount: payment.amount,
        currency: env.CURRENCY,
        receipt: order.orderNumber,
        customer: customerOf(payment),
        returnUrl: urls.returnUrl,
        notifyUrl: urls.notifyUrl,
      });
      // Two concurrent starts may both create a gateway order; only the first one is kept.
      const claimed = await prisma.payment.updateMany({
        where: { id: payment.id, providerOrderId: payment.providerOrderId },
        data: { providerOrderId: created.providerOrderId, provider: provider.name },
      });
      if (claimed.count === 0) {
        const current = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id }, select: { provider: true } });
        if (current.provider !== provider.name) {
          throw new AppError(409, "PAYMENT_IN_PROGRESS", "Payment is already being started. Please try again.");
        }
      }
    }

    await prisma.payment.updateMany({
      where: { id: payment.id, status: { in: [PaymentStatus.PENDING, PaymentStatus.FAILED] } },
      data: { status: PaymentStatus.PROCESSING, failureReason: null },
    });
    await redis.set(appReturnKey(payment.id), input.appReturnUrl, "PX", Math.max(expiresAt.getTime() - Date.now(), 1000) + 600_000);

    return {
      orderId: order.id,
      provider: provider.name,
      testMode: provider.testMode,
      amount: payment.amount.toFixed(2),
      currency: env.CURRENCY,
      expiresAt,
      checkoutUrl: urls.checkoutUrl,
    };
  }

  function messagePage(title: string, message: string, status = 200): BrowserResponse {
    return { html: paymentPage({ title, message }), status };
  }

  async function loadForBrowser(token: string) {
    const paymentId = readCheckoutToken(token);
    return paymentId ? prisma.payment.findUnique({ where: { id: paymentId }, select: paymentSelect }) : null;
  }

  async function backToApp(paymentId: string, orderId: string, result: PaymentResult): Promise<BrowserResponse> {
    const appUrl = await redis.get(appReturnKey(paymentId));
    const messages: Record<PaymentResult, [string, string]> = {
      success: ["Payment successful", "Your order is confirmed."],
      failed: ["Payment failed", "No money was taken. You can try again from the app."],
      cancelled: ["Payment cancelled", "You can try again from the app."],
      pending: ["Checking your payment", "We will update your order as soon as the payment is confirmed."],
    };
    const [title, message] = messages[result];

    if (!appUrl) {
      return messagePage(title, `${message} You can close this page and return to the app.`);
    }

    const url = `${appUrl}${appUrl.includes("?") ? "&" : "?"}${new URLSearchParams({ status: result, orderId })}`;
    return {
      status: 200,
      html: paymentPage({
        title,
        message,
        body: `<a class="button" href="${escapeHtml(url)}">Return to the app</a>
<script>location.replace(${scriptJson(url)});</script>`,
      }),
    };
  }

  /** The page the app opens in the browser; it hands the customer to the gateway's checkout. */
  async function renderCheckout(token: string, baseUrl: string): Promise<BrowserResponse> {
    const payment = await loadForBrowser(token);
    if (!payment) {
      return messagePage("Payment link expired", "Return to the app and try again.", 404);
    }
    if (payment.status === PaymentStatus.PAID || payment.status === PaymentStatus.REFUNDED) {
      return backToApp(payment.id, payment.order.id, "success");
    }
    if (payment.order.status !== OrderStatus.PENDING_PAYMENT) {
      return messagePage("Payment closed", "This order is no longer awaiting payment.", 409);
    }

    const provider = await providerFor(payment.provider);
    if (!provider || !payment.providerOrderId) {
      return messagePage("Payment unavailable", "Return to the app and try again.", 409);
    }

    const { appearance } = await getAppearance(prisma);
    const html = await provider.checkoutPage({
      providerOrderId: payment.providerOrderId,
      amount: payment.amount,
      currency: env.CURRENCY,
      orderNumber: payment.order.orderNumber,
      customer: customerOf(payment),
      appName: appearance.appName,
      brandColor: appearance.theme.colors.primary,
      returnUrl: checkoutUrls(baseUrl, provider, payment).returnUrl,
    });
    return { html, status: 200 };
  }

  /** The gateway sends the customer here after checkout; the result is verified before it is recorded. */
  async function handleReturn(providerName: string, token: string, params: Record<string, string>): Promise<BrowserResponse> {
    const payment = await loadForBrowser(token);
    if (!payment || payment.provider !== providerName || !payment.providerOrderId) {
      return messagePage("Payment link expired", "If money was taken, your order will update shortly.", 404);
    }
    if (payment.status === PaymentStatus.PAID || payment.status === PaymentStatus.REFUNDED) {
      return backToApp(payment.id, payment.order.id, "success");
    }

    const provider = await providerFor(payment.provider);
    if (!provider) {
      return backToApp(payment.id, payment.order.id, "pending");
    }

    let result: PaymentResult;
    try {
      const outcome = await provider.confirmReturn({ providerOrderId: payment.providerOrderId, params });
      if (outcome.type === "payment.captured") {
        await recordCapture(payment.providerOrderId, outcome.providerPaymentId);
        result = "success";
      } else if (outcome.type === "payment.failed") {
        await recordFailure(payment.providerOrderId, outcome.reason);
        result = "failed";
      } else {
        result = outcome.type === "cancelled" ? "cancelled" : "pending";
      }
    } catch (error) {
      // The webhook or the app's next refresh settles it.
      log.error({ err: error, paymentId: payment.id, provider: provider.name }, "Could not confirm payment return");
      result = "pending";
    }

    return backToApp(payment.id, payment.order.id, result);
  }

  /** Idempotent: the return page and the gateway's webhook can both report the same payment. */
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

  /** Webhooks are accepted from every configured gateway, so payments started before a switch still settle. */
  async function handleWebhook(providerName: string, rawBody: string, headers: IncomingHttpHeaders) {
    const provider = await providerFor(providerName);
    if (!provider) {
      throw new AppError(404, "NOT_FOUND", "Unknown payment provider");
    }

    const event = provider.parseWebhook(rawBody, headers);
    if (!event) {
      throw new AppError(401, "INVALID_WEBHOOK_SIGNATURE", "Webhook signature is invalid");
    }

    if (event.type !== "ignored") {
      const payment = await prisma.payment.findUnique({
        where: { providerOrderId: event.providerOrderId },
        select: { provider: true },
      });
      if (payment && payment.provider !== provider.name) {
        log.warn({ providerOrderId: event.providerOrderId, provider: provider.name }, "Webhook from a different gateway ignored");
        return;
      }
    }

    await handleEvent(event);
  }

  /**
   * Refunds whatever a paid online payment holds beyond what the order now costs: everything once
   * the order is cancelled, or the price of items the store could not supply. Refunds go through the
   * gateway that took the payment. The payment row stays locked during the gateway call so
   * concurrent callers cannot refund twice.
   */
  async function refundOrderPayment(orderId: string) {
    return prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Payment" WHERE "orderId" = ${orderId} FOR UPDATE`;
        const payment = await tx.payment.findUnique({
          where: { orderId },
          include: { order: { select: { status: true, total: true } } },
        });

        if (
          !payment ||
          payment.method !== PaymentMethod.ONLINE ||
          payment.status !== PaymentStatus.PAID ||
          !payment.transactionId ||
          !payment.providerOrderId
        ) {
          return false;
        }

        const kept = payment.order.status === OrderStatus.CANCELLED ? new Prisma.Decimal(0) : payment.order.total;
        const due = payment.amount.minus(payment.refundedAmount).minus(kept);
        if (due.lte(0)) {
          return false;
        }

        const provider = await providerFor(payment.provider);
        if (!provider) {
          throw new AppError(409, "PAYMENT_GATEWAY_NOT_CONFIGURED", `Gateway "${payment.provider}" is not configured`);
        }

        const { providerRefundId } = await provider.refund({
          providerOrderId: payment.providerOrderId,
          providerPaymentId: payment.transactionId,
          amount: due,
          // Stable across retries of the same refund, different for each later refund.
          idempotencyKey: `${payment.id}_${toMinorUnits(payment.refundedAmount)}`,
        });

        const refundedAmount = payment.refundedAmount.plus(due);
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            refundedAmount,
            status: refundedAmount.eq(payment.amount) ? PaymentStatus.REFUNDED : PaymentStatus.PAID,
            providerRefundId,
            refundedAt: new Date(),
          },
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

  /** Call after items are removed from a paid order: refunds their price to online payments. */
  async function settleReducedOrder(orderId: string) {
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

    const pendingRefunds = await prisma.$queryRaw<{ orderId: string }[]>`
      SELECT p."orderId" FROM "Payment" p
      JOIN "Order" o ON o.id = p."orderId"
      WHERE p.method = 'ONLINE' AND p.status = 'PAID'
        AND (o.status = 'CANCELLED' OR p.amount - p."refundedAmount" > o.total)
      LIMIT ${SWEEP_BATCH_SIZE}
    `;

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
    renderCheckout,
    handleReturn,
    handleEvent,
    handleWebhook,
    settleCancelledOrder,
    settleReducedOrder,
    sweep,
  };
}
