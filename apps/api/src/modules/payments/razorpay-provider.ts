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
  toMinorUnits,
} from "./gateway-helpers.js";
import type { PaymentEvent, PaymentProvider } from "./payment-provider.js";

const API = "https://api.razorpay.com/v1";
const LABEL = "Razorpay";

const webhookSchema = z.object({
  event: z.string(),
  payload: z
    .object({
      payment: z
        .object({
          entity: z.object({
            id: z.string(),
            order_id: z.string().nullable().optional(),
            error_description: z.string().nullable().optional(),
          }),
        })
        .optional(),
    })
    .optional(),
});

/**
 * Razorpay Standard Checkout. Payments must be captured automatically (Razorpay's default for
 * orders); the webhook then confirms them with payment.captured.
 */
export function createRazorpayProvider(config: { keyId: string; keySecret: string; webhookSecret: string }) {
  const authorization = `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64")}`;

  return {
    name: "razorpay",
    label: LABEL,
    testMode: config.keyId.startsWith("rzp_test_"),

    async createOrder({ amount, currency, receipt }) {
      const order = await gatewayJson<{ id: string }>(LABEL, `${API}/orders`, {
        method: "POST",
        headers: { authorization },
        json: { amount: toMinorUnits(amount), currency, receipt: receipt.slice(0, 40), notes: { receipt } },
      });
      return { providerOrderId: order.id };
    },

    async checkoutPage({ providerOrderId, amount, currency, orderNumber, customer, appName, brandColor, returnUrl }) {
      const options = {
        key: config.keyId,
        order_id: providerOrderId,
        amount: toMinorUnits(amount),
        currency,
        name: appName,
        description: `Order ${orderNumber}`,
        prefill: { name: customer.name, contact: customer.phone, ...(customer.email && { email: customer.email }) },
        theme: { color: brandColor },
        // Razorpay posts the result (success or failure) to this URL.
        callback_url: returnUrl,
        redirect: true,
      };
      const cancelUrl = `${returnUrl}?cancelled=1`;

      return paymentPage({
        title: "Opening secure payment",
        message: "Taking you to Razorpay…",
        brandColor,
        head: '<script src="https://checkout.razorpay.com/v1/checkout.js"></script>',
        body: `<button id="pay">Pay now</button>
<a class="button secondary" href="${escapeHtml(cancelUrl)}">Cancel</a>
<script>
  const options = ${scriptJson(options)};
  options.modal = { ondismiss: () => location.replace(${scriptJson(cancelUrl)}) };
  const open = () => new Razorpay(options).open();
  document.getElementById("pay").addEventListener("click", open);
  window.addEventListener("load", open);
</script>`,
      });
    },

    async confirmReturn({ providerOrderId, params }) {
      const paymentId = params.razorpay_payment_id;
      const signature = params.razorpay_signature;
      if (paymentId && signature) {
        const expected = hmacSha256(config.keySecret, `${providerOrderId}|${paymentId}`, "hex");
        // An invalid signature is treated like a cancel; the webhook still reports a real payment.
        return safeEqual(expected, signature)
          ? { type: "payment.captured", providerOrderId, providerPaymentId: paymentId }
          : { type: "cancelled" };
      }
      if (params["error[description]"]) {
        return { type: "payment.failed", providerOrderId, reason: params["error[description]"] };
      }
      return { type: "cancelled" };
    },

    parseWebhook(rawBody, headers): PaymentEvent | null {
      const signature = headerValue(headers, "x-razorpay-signature");
      if (!signature || !safeEqual(hmacSha256(config.webhookSecret, rawBody, "hex"), signature)) {
        return null;
      }

      let json: unknown;
      try {
        json = JSON.parse(rawBody);
      } catch {
        return { type: "ignored" };
      }
      const parsed = webhookSchema.safeParse(json);
      const payment = parsed.success ? parsed.data.payload?.payment?.entity : undefined;
      if (!parsed.success || !payment?.order_id) {
        return { type: "ignored" };
      }

      switch (parsed.data.event) {
        case "payment.captured":
        case "order.paid":
          return { type: "payment.captured", providerOrderId: payment.order_id, providerPaymentId: payment.id };
        case "payment.failed":
          return { type: "payment.failed", providerOrderId: payment.order_id, reason: payment.error_description ?? "Payment failed" };
        default:
          return { type: "ignored" };
      }
    },

    async refund({ providerPaymentId, amount, idempotencyKey }) {
      const refund = await gatewayJson<{ id: string }>(LABEL, `${API}/payments/${encodeURIComponent(providerPaymentId)}/refund`, {
        method: "POST",
        headers: { authorization },
        json: { amount: toMinorUnits(amount), receipt: idempotencyKey },
      });
      return { providerRefundId: refund.id };
    },

    async checkCredentials() {
      const url = `${API}/orders?count=1`;
      const result = await gatewayRequest(LABEL, url, { headers: { authorization } });
      if (result.status === 401) return false;
      if (!result.ok) throw new PaymentGatewayError(LABEL, { url, status: result.status, body: result.body });
      return true;
    },
  } satisfies PaymentProvider;
}
