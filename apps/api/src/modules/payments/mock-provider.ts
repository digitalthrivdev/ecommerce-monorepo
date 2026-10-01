import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import type { PaymentProvider } from "./payment-provider.js";

// Development-only provider. The secret is public on purpose; env validation keeps it out of production.
const MOCK_SECRET = "mock-payment-provider-secret";

export const MOCK_WEBHOOK_SIGNATURE_HEADER = "x-mock-signature";

function sign(value: string) {
  return createHmac("sha256", MOCK_SECRET).update(value).digest("hex");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function randomId(prefix: string) {
  return `${prefix}_${randomBytes(9).toString("base64url")}`;
}

const webhookBodySchema = z.object({
  event: z.string(),
  providerOrderId: z.string().min(1),
  providerPaymentId: z.string().min(1),
  reason: z.string().optional(),
});

export const mockPaymentProvider = {
  name: "mock",

  async createOrder() {
    return { providerOrderId: randomId("mock_order") };
  },

  checkoutOptions() {
    return { payUrl: "/payments/mock/pay" };
  },

  verifyCheckout({ providerOrderId, providerPaymentId, signature }) {
    return safeEqual(sign(`${providerOrderId}|${providerPaymentId}`), signature);
  },

  parseWebhook(rawBody, headers) {
    const signature = headers[MOCK_WEBHOOK_SIGNATURE_HEADER];
    if (typeof signature !== "string" || !safeEqual(sign(rawBody), signature)) {
      return null;
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      return { type: "ignored" };
    }

    const parsed = webhookBodySchema.safeParse(json);
    if (!parsed.success) {
      return { type: "ignored" };
    }

    const { event, providerOrderId, providerPaymentId, reason } = parsed.data;
    if (event === "payment.captured") {
      return { type: "payment.captured", providerOrderId, providerPaymentId };
    }
    if (event === "payment.failed") {
      return { type: "payment.failed", providerOrderId, providerPaymentId, reason: reason ?? "Payment failed" };
    }
    return { type: "ignored" };
  },

  async refund() {
    return { providerRefundId: randomId("mock_rfnd") };
  },
} satisfies PaymentProvider;

/** What the provider's checkout would hand back to the app after the customer pays. */
export function mockCheckoutResult(providerOrderId: string) {
  const providerPaymentId = randomId("mock_pay");
  return { providerPaymentId, signature: sign(`${providerOrderId}|${providerPaymentId}`) };
}

export function mockFailedPaymentId() {
  return randomId("mock_pay");
}

export function signMockWebhook(rawBody: string) {
  return sign(rawBody);
}
