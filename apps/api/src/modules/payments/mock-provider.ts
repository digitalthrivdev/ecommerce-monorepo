import { randomBytes } from "node:crypto";

import { z } from "zod";

import { escapeHtml, headerValue, hmacSha256, paymentPage, safeEqual } from "./gateway-helpers.js";
import type { PaymentProvider } from "./payment-provider.js";

// Development-only gateway. The secret is public on purpose; it is never registered in production.
const MOCK_SECRET = "mock-payment-provider-secret";

export const MOCK_WEBHOOK_SIGNATURE_HEADER = "x-mock-signature";

const sign = (value: string) => hmacSha256(MOCK_SECRET, value, "hex");

function randomId(prefix: string) {
  return `${prefix}_${randomBytes(9).toString("base64url")}`;
}

const webhookBodySchema = z.object({
  event: z.string(),
  providerOrderId: z.string().min(1),
  providerPaymentId: z.string().min(1),
  reason: z.string().optional(),
});

function hiddenForm(action: string, fields: Record<string, string>, label: string, className = "") {
  const inputs = Object.entries(fields)
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
    .join("");
  return `<form method="post" action="${escapeHtml(action)}">${inputs}<button class="${className}">${escapeHtml(label)}</button></form>`;
}

export const mockPaymentProvider = {
  name: "mock",
  label: "Test gateway",
  testMode: true,

  async createOrder() {
    return { providerOrderId: randomId("mock_order") };
  },

  async checkoutPage({ providerOrderId, amount, currency, brandColor, returnUrl }) {
    const providerPaymentId = randomId("mock_pay");
    return paymentPage({
      title: `Pay ${currency} ${amount.toFixed(2)}`,
      message: "Test gateway: no money is charged. Choose how this payment should end.",
      brandColor,
      body: [
        hiddenForm(returnUrl, { mock_payment_id: providerPaymentId, mock_signature: sign(`${providerOrderId}|${providerPaymentId}`) }, "Pay successfully"),
        hiddenForm(returnUrl, { mock_outcome: "failed" }, "Simulate a failed payment", "secondary"),
        `<a class="button secondary" href="${escapeHtml(`${returnUrl}?cancelled=1`)}">Cancel</a>`,
      ].join("\n"),
    });
  },

  async confirmReturn({ providerOrderId, params }) {
    const { mock_payment_id: paymentId, mock_signature: signature } = params;
    if (paymentId && signature && safeEqual(sign(`${providerOrderId}|${paymentId}`), signature)) {
      return { type: "payment.captured", providerOrderId, providerPaymentId: paymentId };
    }
    if (params.mock_outcome === "failed") {
      return { type: "payment.failed", providerOrderId, reason: "Payment declined (test gateway)" };
    }
    return { type: "cancelled" };
  },

  parseWebhook(rawBody, headers) {
    const signature = headerValue(headers, MOCK_WEBHOOK_SIGNATURE_HEADER);
    if (!signature || !safeEqual(sign(rawBody), signature)) {
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
      return { type: "payment.failed", providerOrderId, reason: reason ?? "Payment failed" };
    }
    return { type: "ignored" };
  },

  async refund() {
    return { providerRefundId: randomId("mock_rfnd") };
  },

  async checkCredentials() {
    return true;
  },
} satisfies PaymentProvider;

export function signMockWebhook(rawBody: string) {
  return sign(rawBody);
}
