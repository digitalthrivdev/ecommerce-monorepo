import type { IncomingHttpHeaders } from "node:http";

import { z } from "zod";

import { env } from "../../config/env.js";
import type { Prisma } from "../../generated/prisma/client";
import type { CredentialField, Credentials } from "../../shared/credentials.js";
import { createCashfreeProvider } from "./cashfree-provider.js";
import { mockPaymentProvider } from "./mock-provider.js";
import { createRazorpayProvider } from "./razorpay-provider.js";

export type PaymentEvent =
  | { type: "payment.captured"; providerOrderId: string; providerPaymentId: string }
  | { type: "payment.failed"; providerOrderId: string; reason: string }
  | { type: "ignored" };

/** What the gateway reported when it sent the customer back, once verified with the gateway. */
export type ReturnOutcome = PaymentEvent | { type: "cancelled" };

export type CheckoutCustomer = { id: string; name: string; phone: string; email: string | null };

export type CheckoutPageInput = {
  providerOrderId: string;
  amount: Prisma.Decimal;
  currency: string;
  orderNumber: string;
  customer: CheckoutCustomer;
  appName: string;
  brandColor: string;
  /** Absolute URL on this API that the gateway sends the customer back to. */
  returnUrl: string;
};

/**
 * A payment gateway. Customers pay on the gateway's hosted checkout, opened from a page this API
 * serves; the gateway then sends them back to `returnUrl` and confirms the payment by webhook.
 * Add a gateway by implementing this and registering it in `GATEWAYS` below; the admin dashboard
 * builds its credentials form from the definition.
 */
export interface PaymentProvider {
  readonly name: string;
  readonly label: string;
  /** True for test keys or sandbox accounts, where no real money moves. */
  readonly testMode: boolean;

  createOrder(input: {
    amount: Prisma.Decimal;
    currency: string;
    receipt: string;
    customer: CheckoutCustomer;
    returnUrl: string;
    /** Webhook URL for gateways that take it per order; undefined when this API has no public https URL. */
    notifyUrl: string | undefined;
  }): Promise<{ providerOrderId: string }>;

  /** HTML for the page that opens the gateway's checkout. Rendered in the customer's browser. */
  checkoutPage(input: CheckoutPageInput): Promise<string>;

  /** Interprets the gateway's redirect back to `returnUrl`. Never trusts the parameters without verifying them. */
  confirmReturn(input: { providerOrderId: string; params: Record<string, string> }): Promise<ReturnOutcome>;

  /** Returns null when the webhook signature is invalid. */
  parseWebhook(rawBody: string, headers: IncomingHttpHeaders): PaymentEvent | null;

  refund(input: {
    providerOrderId: string;
    providerPaymentId: string;
    amount: Prisma.Decimal;
    /** Letters, digits and underscores, at most 40 characters; the same key never refunds twice. */
    idempotencyKey: string;
  }): Promise<{ providerRefundId: string }>;

  /** False when the gateway rejects the credentials. Used before saving keys entered by an admin. */
  checkCredentials(): Promise<boolean>;
}

export type GatewayDefinition = {
  name: string;
  label: string;
  /** Empty for gateways that need no credentials (the development test gateway). */
  fields: readonly CredentialField[];
  /** What to register in the gateway's dashboard, or null when it needs no webhook setup. */
  webhookEvents: string | null;
  /** Credentials from the server environment, or null when they are not set there. */
  fromEnv(): Credentials | null;
  /** Validates credentials; throws a ZodError naming the bad fields. */
  parse(input: Record<string, string | undefined>): Credentials;
  create(credentials: Credentials): PaymentProvider;
};

const required = z.string().trim().min(1, "Required");
const secret = required.min(8, "Too short").max(256);

function defineGateway<S extends z.ZodObject<Record<string, z.ZodType<string>>>>(definition: {
  name: string;
  label: string;
  fields: readonly CredentialField[];
  webhookEvents: string | null;
  schema: S;
  fromEnv(): z.infer<S> | null;
  create(credentials: z.infer<S>): PaymentProvider;
}): GatewayDefinition {
  const { schema, create, ...rest } = definition;
  return {
    ...rest,
    parse: (input) => schema.parse(input),
    create: (credentials) => create(schema.parse(credentials)),
  };
}

/** Every gateway the platform supports. Add a gateway by implementing PaymentProvider and listing it here. */
export const GATEWAYS: readonly GatewayDefinition[] = [
  defineGateway({
    name: "razorpay",
    label: "Razorpay",
    fields: [
      { key: "keyId", label: "Key ID", secret: false },
      { key: "keySecret", label: "Key secret", secret: true },
      { key: "webhookSecret", label: "Webhook secret", secret: true },
    ],
    webhookEvents: "payment.captured, payment.failed",
    schema: z.object({
      keyId: required.regex(/^rzp_(test|live)_[A-Za-z0-9]+$/, "Starts with rzp_test_ or rzp_live_"),
      keySecret: secret,
      webhookSecret: required.max(256),
    }),
    fromEnv: () =>
      env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_WEBHOOK_SECRET
        ? { keyId: env.RAZORPAY_KEY_ID, keySecret: env.RAZORPAY_KEY_SECRET, webhookSecret: env.RAZORPAY_WEBHOOK_SECRET }
        : null,
    create: createRazorpayProvider,
  }),
  defineGateway({
    name: "cashfree",
    label: "Cashfree Payments",
    fields: [
      { key: "appId", label: "App ID", secret: false },
      { key: "secretKey", label: "Secret key", secret: true },
      { key: "environment", label: "Environment", secret: false, options: ["sandbox", "production"] },
    ],
    webhookEvents: "Payment success and payment failed (webhook version 2023-08-01)",
    schema: z.object({
      appId: required.min(4, "Too short").max(128),
      secretKey: secret,
      environment: z.enum(["sandbox", "production"]),
    }),
    fromEnv: () =>
      env.CASHFREE_APP_ID && env.CASHFREE_SECRET_KEY
        ? { appId: env.CASHFREE_APP_ID, secretKey: env.CASHFREE_SECRET_KEY, environment: env.CASHFREE_ENVIRONMENT }
        : null,
    create: createCashfreeProvider,
  }),
  ...(env.NODE_ENV === "production"
    ? []
    : [
        defineGateway({
          name: "mock",
          label: "Test gateway",
          fields: [],
          webhookEvents: null,
          schema: z.object({}),
          fromEnv: () => ({}),
          create: () => mockPaymentProvider,
        }),
      ]),
];
