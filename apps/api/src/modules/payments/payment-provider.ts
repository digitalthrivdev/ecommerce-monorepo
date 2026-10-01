import type { IncomingHttpHeaders } from "node:http";

import { env } from "../../config/env.js";
import type { Prisma } from "../../generated/prisma/client";
import { mockPaymentProvider } from "./mock-provider.js";

export type PaymentEvent =
  | { type: "payment.captured"; providerOrderId: string; providerPaymentId: string }
  | { type: "payment.failed"; providerOrderId: string; providerPaymentId: string; reason: string }
  | { type: "ignored" };

export interface PaymentProvider {
  readonly name: string;

  createOrder(input: {
    amount: Prisma.Decimal;
    currency: string;
    receipt: string;
  }): Promise<{ providerOrderId: string }>;

  /** Public data the app needs to open the provider's checkout. Never include secrets. */
  checkoutOptions(providerOrderId: string): Record<string, unknown>;

  /** Verifies the signature the provider's checkout returns to the app after a successful payment. */
  verifyCheckout(input: { providerOrderId: string; providerPaymentId: string; signature: string }): boolean;

  /** Returns null when the webhook signature is invalid. */
  parseWebhook(rawBody: string, headers: IncomingHttpHeaders): PaymentEvent | null;

  refund(input: {
    providerPaymentId: string;
    amount: Prisma.Decimal;
    idempotencyKey: string;
  }): Promise<{ providerRefundId: string }>;
}

export function createPaymentProvider(): PaymentProvider | null {
  switch (env.PAYMENT_PROVIDER) {
    case "mock":
      return mockPaymentProvider;
    case "none":
      return null;
  }
}
