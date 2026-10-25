import { randomBytes } from "node:crypto";

import { z } from "zod";

import { ShipmentStatus } from "../../generated/prisma/client";
import { headerValue, hmacSha256, safeEqual } from "../payments/gateway-helpers.js";
import type { ShippingProvider } from "./shipping-provider.js";

// Development-only carrier. The secret is public on purpose; it is never registered in production.
const MOCK_SECRET = "mock-shipping-carrier-secret";

export const MOCK_SHIPPING_SIGNATURE_HEADER = "x-mock-signature";

export const signMockShippingWebhook = (rawBody: string) => hmacSha256(MOCK_SECRET, rawBody, "hex");

/** Pincodes the test carrier refuses, for trying out the unhappy paths. */
export const MOCK_UNSERVICEABLE_PINCODE = "999999";
export const MOCK_NO_COD_PINCODE_PREFIX = "99";

const randomId = (prefix: string) => `${prefix}_${randomBytes(9).toString("base64url")}`;

const webhookBodySchema = z.object({
  awb: z.string().min(1).optional(),
  shipmentId: z.string().min(1).optional(),
  status: z.string(),
  eventId: z.string().min(1).optional(),
  occurredAt: z.coerce.date().optional(),
  location: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
});

const STATUSES = new Set<string>(Object.values(ShipmentStatus));

export const mockCarrier: ShippingProvider = {
  name: "mock",
  label: "Test carrier",
  testMode: true,
  reportsTracking: true,
  booksInApp: true,

  async checkServiceability({ deliveryPincode }) {
    const serviceable = deliveryPincode !== MOCK_UNSERVICEABLE_PINCODE;
    return {
      serviceable,
      codAvailable: serviceable && !deliveryPincode.startsWith(MOCK_NO_COD_PINCODE_PREFIX),
      etaDays: serviceable ? 3 : null,
    };
  },

  async createShipment() {
    return {
      providerOrderId: randomId("mock_order"),
      providerShipmentId: randomId("mock_shipment"),
      awb: null,
      courierName: null,
      trackingUrl: null,
      status: ShipmentStatus.PENDING,
    };
  },

  async assignAwb() {
    const awb = `MOCK${randomBytes(5).readUIntBE(0, 5).toString().padStart(13, "0")}`;
    return { awb, courierName: "Test Courier", trackingUrl: null };
  },

  async schedulePickup() {
    return { status: ShipmentStatus.PICKUP_SCHEDULED };
  },

  async getLabel(shipment) {
    const text = `TEST LABEL - NOT FOR SHIPPING\nAWB ${shipment.awb ?? "-"}\n`;
    return { labelUrl: `data:text/plain;base64,${Buffer.from(text).toString("base64")}` };
  },

  async track() {
    return [];
  },

  async cancelShipment() {},

  parseWebhook(rawBody, headers) {
    const signature = headerValue(headers, MOCK_SHIPPING_SIGNATURE_HEADER);
    if (!signature || !safeEqual(signature, signMockShippingWebhook(rawBody))) return null;

    let body: z.infer<typeof webhookBodySchema>;
    try {
      body = webhookBodySchema.parse(JSON.parse(rawBody));
    } catch {
      return { type: "ignored" };
    }
    if (!STATUSES.has(body.status) || (!body.awb && !body.shipmentId)) return { type: "ignored" };

    const occurredAt = body.occurredAt ?? new Date();
    return {
      type: "event",
      awb: body.awb ?? null,
      providerShipmentId: body.shipmentId ?? null,
      event: {
        status: body.status as ShipmentStatus,
        providerEventId: body.eventId ?? `${body.status}:${occurredAt.toISOString()}`,
        occurredAt,
        location: body.location ?? null,
        description: body.description ?? null,
      },
    };
  },

  async checkCredentials() {
    return true;
  },
};
