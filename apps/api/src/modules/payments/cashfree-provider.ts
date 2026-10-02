import { randomBytes } from "node:crypto";

import { z } from "zod";

import {
  escapeHtml,
  gatewayJson,
  gatewayRequest,
  headerValue,
  hmacSha256,
  PaymentGatewayError,
  paymentPage,
  safeEqual,
  scriptJson,
} from "./gateway-helpers.js";
import type { PaymentEvent, PaymentProvider } from "./payment-provider.js";

const LABEL = "Cashfree";
const API_VERSION = "2023-08-01";
/** Webhooks older than this are rejected, so a captured request cannot be replayed later. */
const WEBHOOK_MAX_AGE_MS = 10 * 60 * 1000;

type CashfreeOrder = { order_id: string; order_status: "ACTIVE" | "PAID" | "EXPIRED" | "TERMINATED" | string; payment_session_id: string };
type CashfreePayment = {
  cf_payment_id: number | string;
  payment_status: "SUCCESS" | "FAILED" | "PENDING" | "USER_DROPPED" | string;
  payment_message?: string | null;
  error_details?: { error_description?: string | null } | null;
};

const webhookSchema = z.object({
  type: z.string(),
  data: z.object({
    order: z.object({ order_id: z.string() }),
    payment: z
      .object({ cf_payment_id: z.union([z.number(), z.string()]), payment_message: z.string().nullable().optional() })
      .optional(),
    error_details: z.object({ error_description: z.string().nullable().optional() }).nullable().optional(),
  }),
});

/** Cashfree Payments hosted checkout (JS SDK v3) with the PG API version 2023-08-01. */
export function createCashfreeProvider(config: { appId: string; secretKey: string; environment: "sandbox" | "production" }) {
  const api = config.environment === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";
  const headers = { "x-client-id": config.appId, "x-client-secret": config.secretKey, "x-api-version": API_VERSION };

  const getOrder = (orderId: string) =>
    gatewayJson<CashfreeOrder>(LABEL, `${api}/orders/${encodeURIComponent(orderId)}`, { headers });

  const getPayments = (orderId: string) =>
    gatewayJson<CashfreePayment[]>(LABEL, `${api}/orders/${encodeURIComponent(orderId)}/payments`, { headers });

  return {
    name: "cashfree",
    label: "Cashfree Payments",
    testMode: config.environment === "sandbox",

    async createOrder({ amount, currency, receipt, customer, returnUrl, notifyUrl }) {
      // Order ids are unique per Cashfree account, and an order may need a fresh one after a gateway switch.
      const orderId = `${receipt.replace(/[^A-Za-z0-9_-]/g, "")}_${randomBytes(4).toString("hex")}`;
      const order = await gatewayJson<CashfreeOrder>(LABEL, `${api}/orders`, {
        method: "POST",
        headers,
        json: {
          order_id: orderId,
          order_amount: Number(amount.toFixed(2)),
          order_currency: currency,
          customer_details: {
            customer_id: customer.id,
            customer_name: customer.name,
            // Cashfree expects the 10-digit national number.
            customer_phone: customer.phone.replace(/\D/g, "").slice(-10),
            ...(customer.email && { customer_email: customer.email }),
          },
          order_meta: { return_url: returnUrl, ...(notifyUrl && { notify_url: notifyUrl }) },
          order_note: receipt,
        },
      });
      return { providerOrderId: order.order_id };
    },

    async checkoutPage({ providerOrderId, brandColor, returnUrl }) {
      const order = await getOrder(providerOrderId);
      const cancelUrl = `${returnUrl}?cancelled=1`;

      return paymentPage({
        title: "Opening secure payment",
        message: "Taking you to Cashfree…",
        brandColor,
        head: '<script src="https://sdk.cashfree.com/js/v3/cashfree.js"></script>',
        body: `<button id="pay">Pay now</button>
<a class="button secondary" href="${escapeHtml(cancelUrl)}">Cancel</a>
<script>
  const cashfree = Cashfree({ mode: ${scriptJson(config.environment)} });
  const open = () => cashfree.checkout({ paymentSessionId: ${scriptJson(order.payment_session_id)}, redirectTarget: "_self" });
  document.getElementById("pay").addEventListener("click", open);
  window.addEventListener("load", open);
</script>`,
      });
    },

    // Cashfree's redirect carries no signature, so the order status is read from the API instead.
    async confirmReturn({ providerOrderId, params }) {
      if (params.cancelled) {
        return { type: "cancelled" };
      }

      const order = await getOrder(providerOrderId);
      const payments = order.order_status === "PAID" || order.order_status === "ACTIVE" ? await getPayments(providerOrderId) : [];

      if (order.order_status === "PAID") {
        const paid = payments.find((payment) => payment.payment_status === "SUCCESS");
        if (paid) {
          return { type: "payment.captured", providerOrderId, providerPaymentId: String(paid.cf_payment_id) };
        }
        return { type: "cancelled" };
      }

      if (order.order_status === "EXPIRED" || order.order_status === "TERMINATED") {
        return { type: "payment.failed", providerOrderId, reason: "Payment session expired" };
      }

      const failed = payments.find((payment) => payment.payment_status === "FAILED");
      if (failed) {
        return {
          type: "payment.failed",
          providerOrderId,
          reason: failed.error_details?.error_description ?? failed.payment_message ?? "Payment failed",
        };
      }
      return { type: "cancelled" };
    },

    parseWebhook(rawBody, requestHeaders): PaymentEvent | null {
      const signature = headerValue(requestHeaders, "x-webhook-signature");
      const timestamp = headerValue(requestHeaders, "x-webhook-timestamp");
      if (!signature || !timestamp || !safeEqual(hmacSha256(config.secretKey, timestamp + rawBody, "base64"), signature)) {
        return null;
      }
      const raw = Number(timestamp);
      const sentAt = raw < 1e12 ? raw * 1000 : raw;
      if (!Number.isFinite(sentAt) || Math.abs(Date.now() - sentAt) > WEBHOOK_MAX_AGE_MS) {
        return null;
      }

      let json: unknown;
      try {
        json = JSON.parse(rawBody);
      } catch {
        return { type: "ignored" };
      }
      const parsed = webhookSchema.safeParse(json);
      if (!parsed.success) {
        return { type: "ignored" };
      }

      const { type, data } = parsed.data;
      if (type === "PAYMENT_SUCCESS_WEBHOOK" && data.payment) {
        return { type: "payment.captured", providerOrderId: data.order.order_id, providerPaymentId: String(data.payment.cf_payment_id) };
      }
      if (type === "PAYMENT_FAILED_WEBHOOK") {
        return {
          type: "payment.failed",
          providerOrderId: data.order.order_id,
          reason: data.error_details?.error_description ?? data.payment?.payment_message ?? "Payment failed",
        };
      }
      return { type: "ignored" };
    },

    async refund({ providerOrderId, amount, idempotencyKey }) {
      const url = `${api}/orders/${encodeURIComponent(providerOrderId)}/refunds`;
      const created = await gatewayRequest<{ cf_refund_id?: string | number; message?: string }>(LABEL, url, {
        method: "POST",
        headers,
        json: { refund_amount: Number(amount.toFixed(2)), refund_id: idempotencyKey, refund_note: "Order refund" },
      });
      if (created.ok && created.body.cf_refund_id !== undefined) {
        return { providerRefundId: String(created.body.cf_refund_id) };
      }

      // A retry after an earlier attempt went through: the refund id already exists, so look it up.
      const existing = await gatewayRequest<{ cf_refund_id?: string | number }>(LABEL, `${url}/${encodeURIComponent(idempotencyKey)}`, { headers });
      if (existing.ok && existing.body.cf_refund_id !== undefined) {
        return { providerRefundId: String(existing.body.cf_refund_id) };
      }
      throw new PaymentGatewayError(LABEL, { url, status: created.status, body: created.body });
    },

    // Cashfree has no "who am I" call: looking up an order that cannot exist gives 404 with valid
    // keys and 401 with wrong ones.
    async checkCredentials() {
      const url = `${api}/orders/credential_check_${randomBytes(6).toString("hex")}`;
      const result = await gatewayRequest(LABEL, url, { headers });
      if (result.status === 401 || result.status === 403) return false;
      if (result.ok || result.status === 404) return true;
      throw new PaymentGatewayError(LABEL, { url, status: result.status, body: result.body });
    },
  } satisfies PaymentProvider;
}
