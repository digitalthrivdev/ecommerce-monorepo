import type { IncomingHttpHeaders } from "node:http";

import { z } from "zod";

import { env } from "../../config/env.js";
import type { Prisma, ShipmentStatus } from "../../generated/prisma/client";
import type { CredentialField, Credentials } from "../../shared/credentials.js";
import { createFshipProvider } from "./fship-carrier.js";
import { manualCarrier } from "./manual-carrier.js";
import { mockCarrier } from "./mock-carrier.js";
import { createShiprocketProvider } from "./shiprocket-carrier.js";

/** A tracking update in our terms. `providerEventId` identifies it, so the same update is recorded once. */
export type ShipmentEventInput = {
  status: ShipmentStatus;
  providerEventId: string;
  occurredAt: Date;
  location: string | null;
  description: string | null;
};

/** A webhook names the shipment by AWB or by the carrier's shipment id. */
export type ShipmentWebhook =
  | { type: "event"; awb: string | null; providerShipmentId: string | null; event: ShipmentEventInput }
  | { type: "ignored" };

export type ShipmentAddress = {
  name: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  postalCode: string;
};

export type ShipmentInput = {
  orderNumber: string;
  orderDate: Date;
  pickup: ShipmentAddress & { id: string };
  delivery: ShipmentAddress;
  items: { name: string; sku: string; hsn: string | null; quantity: number; unitPrice: Prisma.Decimal }[];
  /** What the courier collects; zero for prepaid orders. */
  codAmount: Prisma.Decimal;
  orderTotal: Prisma.Decimal;
  parcel: { weightGrams: number; lengthCm: Prisma.Decimal; breadthCm: Prisma.Decimal; heightCm: Prisma.Decimal };
  /** Typed by the admin; only the manual carrier uses them. */
  manual?: { courierName: string; awb: string; trackingUrl: string | null };
};

/** Where the carrier is with the shipment once it is booked. */
export type BookedShipment = {
  providerOrderId: string | null;
  providerShipmentId: string | null;
  awb: string | null;
  courierName: string | null;
  trackingUrl: string | null;
  status: ShipmentStatus;
};

export type ShipmentRef = { providerOrderId: string | null; providerShipmentId: string | null; awb: string | null };

export type ReturnPickupInput = {
  orderNumber: string;
  orderDate: Date;
  pickup: ShipmentAddress & { email: string };
  delivery: ShipmentAddress;
  items: { name: string; sku: string; quantity: number; unitPrice: Prisma.Decimal }[];
  parcel: { weightGrams: number; lengthCm: Prisma.Decimal; breadthCm: Prisma.Decimal; heightCm: Prisma.Decimal };
};

export type ReturnPickup = { providerOrderId: string; providerShipmentId: string; awb: string; courierName: string; trackingUrl: string };

/**
 * A shipping carrier or aggregator. The API books a shipment, gets an AWB, schedules the pickup and
 * fetches the label; afterwards the carrier reports progress by webhook (or `track`). Add a carrier
 * by implementing this and listing it in `CARRIERS` below; the dashboard builds its credentials
 * form from the definition.
 */
export interface ShippingProvider {
  readonly name: string;
  readonly label: string;
  /** True for sandbox accounts and the test carrier, where nothing is really shipped. */
  readonly testMode: boolean;
  /** False when the admin moves the shipment along by hand (no webhooks or tracking API). */
  readonly reportsTracking: boolean;

  checkServiceability(input: {
    pickupPincode: string;
    deliveryPincode: string;
    weightGrams: number;
    cod: boolean;
  }): Promise<{ serviceable: boolean; codAvailable: boolean; etaDays: number | null }>;

  createShipment(input: ShipmentInput): Promise<BookedShipment>;

  /** Optional carrier generated reverse pickup. Unsupported carriers use manual details. */
  createReturnPickup?(input: ReturnPickupInput): Promise<ReturnPickup>;

  /** For carriers that book first and assign the courier and AWB as a second step. */
  assignAwb(shipment: ShipmentRef): Promise<{ awb: string; courierName: string | null; trackingUrl: string | null }>;

  schedulePickup(shipment: ShipmentRef): Promise<{ status: ShipmentStatus }>;

  /** Null when the carrier has no label (manual: the courier's own label is used). */
  getLabel(shipment: ShipmentRef): Promise<{ labelUrl: string } | null>;

  /** Every tracking update the carrier has, oldest first. */
  track(shipment: ShipmentRef): Promise<ShipmentEventInput[]>;

  cancelShipment(shipment: ShipmentRef): Promise<void>;

  /** Returns null when the webhook signature is invalid. */
  parseWebhook(rawBody: string, headers: IncomingHttpHeaders): ShipmentWebhook | null;

  /** False when the carrier rejects the credentials. Used before saving keys entered by an admin. */
  checkCredentials(): Promise<boolean>;
}

export type CarrierDefinition = {
  name: string;
  label: string;
  /** Custom slug for webhook URLs when the carrier name has restricted words (e.g. Shiprocket blocks its own name). */
  webhookSlug?: string;
  /** Other path slugs accepted on incoming webhooks (e.g. ['srocket', 'rocket']). */
  webhookAliases?: readonly string[];
  /** Empty for carriers that need no credentials. */
  fields: readonly CredentialField[];
  /** What to register in the carrier's dashboard, or null when it has no webhooks. */
  webhookEvents: string | null;
  /** Credentials from the server environment, or null when they are not set there. */
  fromEnv(): Credentials | null;
  /** Validates credentials; throws a ZodError naming the bad fields. */
  parse(input: Record<string, string | undefined>): Credentials;
  create(credentials: Credentials): ShippingProvider;
};

function defineCarrier<S extends z.ZodObject<Record<string, z.ZodType<string>>>>(definition: {
  name: string;
  label: string;
  webhookSlug?: string;
  webhookAliases?: readonly string[];
  fields: readonly CredentialField[];
  webhookEvents: string | null;
  schema: S;
  fromEnv(): z.infer<S> | null;
  create(credentials: z.infer<S>): ShippingProvider;
}): CarrierDefinition {
  const { schema, create, ...rest } = definition;
  return {
    ...rest,
    parse: (input) => schema.parse(input),
    create: (credentials) => create(schema.parse(credentials)),
  };
}

const required = z.string().trim().min(1, "Required");

export const MANUAL_CARRIER = "manual";

/** Carriers whose shipments an admin moves along by hand (the test carrier too, for trying the flow). */
export const HAND_TRACKED_CARRIERS: readonly string[] = [MANUAL_CARRIER, "mock"];

/** Every carrier the platform supports. Add a carrier by implementing ShippingProvider and listing it here. */
export const CARRIERS: readonly CarrierDefinition[] = [
  defineCarrier({
    name: MANUAL_CARRIER,
    label: "Manual (book the courier yourself)",
    fields: [],
    webhookEvents: null,
    schema: z.object({}),
    fromEnv: () => ({}),
    create: () => manualCarrier,
  }),
  defineCarrier({
    name: "shiprocket",
    label: "Shiprocket",
    webhookSlug: "rocket",
    webhookAliases: ["srocket", "rocket"],
    fields: [
      { key: "email", label: "API user email", secret: false },
      { key: "password", label: "API user password", secret: true },
      {
        key: "webhookToken",
        label: "Webhook token",
        secret: true,
        help: "Set the same value in Shiprocket → Settings → API → Webhooks.",
      },
      {
        key: "pickupLocation",
        label: "Pickup location nickname",
        secret: false,
        help: "The pickup location name in your Shiprocket account.",
      },
    ],
    webhookEvents: "Tracking updates",
    schema: z.object({
      email: required.regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "Enter the API user email"),
      password: required,
      webhookToken: required,
      pickupLocation: required.max(36, "At most 36 characters"),
    }),
    fromEnv: () =>
      env.SHIPROCKET_API_EMAIL && env.SHIPROCKET_API_PASSWORD && env.SHIPROCKET_WEBHOOK_TOKEN && env.SHIPROCKET_PICKUP_LOCATION
        ? {
            email: env.SHIPROCKET_API_EMAIL,
            password: env.SHIPROCKET_API_PASSWORD,
            webhookToken: env.SHIPROCKET_WEBHOOK_TOKEN,
            pickupLocation: env.SHIPROCKET_PICKUP_LOCATION,
          }
        : null,
    create: createShiprocketProvider,
  }),
  defineCarrier({
    name: "fship",
    label: "Fship",
    fields: [
      {
        key: "clientKey",
        label: "Client Key",
        secret: true,
        help: "The security token key under Settings → API Details in your Fship account.",
      },
      {
        key: "pickupAddressId",
        label: "Warehouse address id",
        secret: false,
        help: "The address id of your pickup warehouse under Manage Warehouse in the Fship panel.",
      },
    ],
    webhookEvents: null,
    schema: z.object({
      clientKey: required.min(10, "Enter the Client Key from Fship → Settings → API Details"),
      pickupAddressId: required.regex(/^\d+$/, "Enter the numeric warehouse address id"),
    }),
    fromEnv: () =>
      env.FSHIP_CLIENT_KEY && env.FSHIP_PICKUP_ADDRESS_ID
        ? { clientKey: env.FSHIP_CLIENT_KEY, pickupAddressId: env.FSHIP_PICKUP_ADDRESS_ID }
        : null,
    create: (credentials) => createFshipProvider({ ...credentials, baseUrl: env.FSHIP_BASE_URL }),
  }),
  ...(env.NODE_ENV === "production"
    ? []
    : [
        defineCarrier({
          name: "mock",
          label: "Test carrier",
          fields: [],
          webhookEvents: null,
          schema: z.object({}),
          fromEnv: () => ({}),
          create: () => mockCarrier,
        }),
      ]),
];
