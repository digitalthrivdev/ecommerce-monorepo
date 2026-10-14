import { z } from "zod";

import { ShipmentStatus } from "../../generated/prisma/client";
import { redis } from "../../infrastructure/redis/client.js";
import { AppError } from "../../shared/errors.js";
import { headerValue, safeEqual } from "../payments/gateway-helpers.js";
import type {
  BookedShipment,
  ShipmentEventInput,
  ShipmentInput,
  ShipmentRef,
  ShipmentWebhook,
  ShippingProvider,
} from "./shipping-provider.js";

/**
 * Shiprocket (https://apiv2.shiprocket.in/v1/external). Endpoints used, all under that base URL:
 *   POST /auth/login                  token (cite: apidocs-test.shiprocket.in/guides/authentication)
 *   GET  /courier/serviceability/     pincode serviceability (cite: guides/order-lifecycle)
 *   POST /orders/create/adhoc         book the order (cite: guides/order-lifecycle)
 *   POST /courier/assign/awb          assign the courier and AWB (cite: guides/order-lifecycle)
 *   POST /courier/generate/pickup     schedule the pickup (cite: guides/order-lifecycle)
 *   POST /courier/generate/label      the shipping label PDF (cite: guides/order-lifecycle)
 *   GET  /courier/track/awb/{awb}     tracking history (cite: guides/webhooks)
 *   POST /orders/cancel               cancel before the parcel is picked up (cite: guides/order-lifecycle)
 *   POST /orders/cancel/shipment/awbs cancel by AWB
 * Webhooks are configured in the Shiprocket panel (Settings → API → Webhooks) and verified by the
 * `x-api-key` header (cite: apidocs-test.shiprocket.in/guides/webhooks).
 */
const API_BASE = "https://apiv2.shiprocket.in/v1/external";

/** Webhook token header Shiprocket sets from the security token in the panel (guides/webhooks). */
export const SHIPROCKET_WEBHOOK_HEADER = "x-api-key";

/**
 * The token lasts about 240 hours (10 days). Refresh a day early so a request never runs with an
 * expired token (guides/authentication).
 */
const TOKEN_TTL_SECONDS = 9 * 24 * 60 * 60;

/** Shiprocket's numeric status ids (`current_status_id` / `shipment_status_id`) mapped to ours. */
const STATUS_BY_ID: Record<number, ShipmentStatus> = {
  1: ShipmentStatus.AWB_ASSIGNED, // AWB assigned
  2: ShipmentStatus.AWB_ASSIGNED, // label generated
  3: ShipmentStatus.PICKUP_SCHEDULED, // pickup scheduled
  4: ShipmentStatus.PICKUP_SCHEDULED, // pickup queued
  5: ShipmentStatus.PICKUP_SCHEDULED, // manifest generated
  6: ShipmentStatus.IN_TRANSIT, // shipped
  7: ShipmentStatus.DELIVERED,
  8: ShipmentStatus.CANCELLED,
  9: ShipmentStatus.RTO_IN_TRANSIT, // RTO initiated
  10: ShipmentStatus.RTO_DELIVERED,
  12: ShipmentStatus.LOST,
  14: ShipmentStatus.RTO_IN_TRANSIT, // RTO acknowledged
  17: ShipmentStatus.OUT_FOR_DELIVERY,
  18: ShipmentStatus.IN_TRANSIT,
  19: ShipmentStatus.PICKUP_SCHEDULED, // out for pickup
  21: ShipmentStatus.NDR, // undelivered
  24: ShipmentStatus.LOST, // destroyed
  25: ShipmentStatus.LOST, // damaged
  38: ShipmentStatus.IN_TRANSIT, // reached destination hub
  39: ShipmentStatus.IN_TRANSIT, // misrouted
  41: ShipmentStatus.RTO_IN_TRANSIT, // RTO out for delivery
  42: ShipmentStatus.PICKED_UP,
  46: ShipmentStatus.RTO_IN_TRANSIT,
};

/**
 * Shiprocket reports statuses as free text (`current_status`, `shipment_status`, scan labels). Map a
 * label to our status, or null when we have no equivalent (delayed, misrouted, pickup error, …).
 */
export function mapShiprocketStatus(raw: string | number | null | undefined): ShipmentStatus | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return STATUS_BY_ID[raw] ?? null;

  const text = raw.toUpperCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (text.includes("RTO") || text.includes("RETURN")) {
    if (text.includes("DELIVER")) return ShipmentStatus.RTO_DELIVERED;
    if (text.includes("CANCEL")) return ShipmentStatus.CANCELLED;
    return ShipmentStatus.RTO_IN_TRANSIT;
  }
  if (text.includes("CANCEL")) return ShipmentStatus.CANCELLED;
  if (text.includes("LOST") || text.includes("DESTROY") || text.includes("DAMAG")) return ShipmentStatus.LOST;
  if (text.includes("UNDELIVER") || text.includes("NDR")) return ShipmentStatus.NDR;
  if (text.includes("OUT FOR DELIVERY")) return ShipmentStatus.OUT_FOR_DELIVERY;
  if (text.includes("DELIVER")) return ShipmentStatus.DELIVERED;
  if (text.includes("PICKUP ERROR") || text.includes("PICKUP EXCEPTION")) return null;
  if (text.includes("OUT FOR PICKUP")) return ShipmentStatus.PICKUP_SCHEDULED;
  if (text.includes("PICKED UP") || text.includes("PICKUP COMPLETE")) return ShipmentStatus.PICKED_UP;
  if (text.includes("PICKUP SCHEDUL") || text.includes("PICKUP QUEUE") || text.includes("PICKUP RESCHEDUL") || text.includes("MANIFEST")) {
    return ShipmentStatus.PICKUP_SCHEDULED;
  }
  if (text.includes("AWB ASSIGN") || text.includes("LABEL GENERAT") || text.includes("BOOKED")) return ShipmentStatus.AWB_ASSIGNED;
  if (text.includes("IN TRANSIT") || text.includes("SHIPPED") || text.includes("REACHED") || text.includes("MISROUT") || text.includes("DESTINATION")) {
    return ShipmentStatus.IN_TRANSIT;
  }
  if (text === "NEW" || text.startsWith("NEW ") || text.includes("PENDING")) return ShipmentStatus.PENDING;
  return null;
}

const loginSchema = z.object({ token: z.string().min(1) }).passthrough();

const serviceabilitySchema = z
  .object({
    data: z
      .object({
        available_courier_companies: z
          .array(
            z
              .object({
                estimated_delivery_days: z.union([z.number(), z.string()]).nullish(),
                cod: z.union([z.number(), z.string(), z.boolean()]).nullish(),
              })
              .passthrough(),
          )
          .nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();

const createOrderSchema = z
  .object({
    order_id: z.union([z.number(), z.string()]),
    shipment_id: z.union([z.number(), z.string()]),
    awb_code: z.string().nullish(),
    courier_name: z.string().nullish(),
  })
  .passthrough();

const assignAwbSchema = z.object({
  awb_assign_status: z.coerce.number(),
  response: z
    .object({
      data: z
        .object({
          awb_code: z.string().nullish(),
          courier_name: z.string().nullish(),
        })
        .passthrough()
        .optional(),
    })
    .passthrough()
    .optional(),
});

const pickupSchema = z.object({ pickup_status: z.coerce.number().optional() }).passthrough();

const labelSchema = z
  .object({
    label_url: z.string().optional(),
    response: z.object({ label_url: z.string().optional() }).passthrough().optional(),
  })
  .passthrough();

const trackingSchema = z
  .object({
    tracking_data: z
      .object({
        track_status: z.union([z.number(), z.string()]).optional(),
        shipment_track_activities: z
          .array(
            z.object({
              date: z.string().optional(),
              status: z.string().optional(),
              activity: z.string().optional(),
              location: z.string().optional(),
            }),
          )
          .optional(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();

const webhookSchema = z
  .object({
    awb: z.string().min(1).optional(),
    courier_name: z.string().optional(),
    current_status: z.string().optional(),
    current_status_id: z.union([z.number(), z.string()]).optional(),
    shipment_status: z.string().optional(),
    shipment_status_id: z.union([z.number(), z.string()]).optional(),
    current_timestamp: z.string().optional(),
    date: z.string().optional(),
    scans: z
      .array(
        z
          .object({
            date: z.string().optional(),
            location: z.string().optional(),
            "sr-status": z.union([z.number(), z.string()]).optional(),
            "sr-status-label": z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

type Result = { status: number; ok: boolean; body: unknown };

/** Shiprocket dates arrive as "DD MM YYYY HH:mm:ss" or "YYYY-MM-DD HH:mm:ss" in IST. */
function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const text = value.trim();
  const dmy = /^(\d{2}) (\d{2}) (\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(text);
  if (dmy) return new Date(`${dmy[3]}-${dmy[2]}-${dmy[1]}T${dmy[4]}:${dmy[5]}:${dmy[6]}+05:30`);
  const ymd = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(text);
  if (ymd) return new Date(`${ymd[1]}-${ymd[2]}-${ymd[3]}T${ymd[4]}:${ymd[5]}:${ymd[6]}+05:30`);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** Shiprocket's order_date format: "yyyy-mm-dd HH:mm". */
function orderDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function tenDigitPhone(phone: string) {
  return phone.replace(/\D/g, "").slice(-10);
}

function errorFor(path: string, result: Result) {
  return new AppError(502, "SHIPPING_CARRIER_ERROR", "Shiprocket could not process the request. Please try again.", {
    path,
    status: result.status,
    body: result.body,
  });
}

/**
 * Shiprocket as a ShippingProvider. Books an adhoc order, assigns the AWB, schedules the pickup and
 * fetches the label, then follows the carrier's webhooks (or `track`). Add it to the dashboard by
 * saving its credentials; see the CARRIERS registry. `pickupLocation` is the pickup location
 * nickname configured in the Shiprocket panel.
 */
export function createShiprocketProvider(config: {
  email: string;
  password: string;
  webhookToken: string;
  pickupLocation: string;
}): ShippingProvider {
  const tokenKey = `shiprocket:token:${config.email}`;

  async function send(path: string, init: { method?: string; json?: unknown; token?: string | null }): Promise<Result> {
    let response: Response;
    try {
      response = await fetch(`${API_BASE}/${path}`, {
        method: init.method ?? "GET",
        headers: {
          accept: "application/json",
          ...(init.json !== undefined && { "content-type": "application/json" }),
          ...(init.token && { authorization: `Bearer ${init.token}` }),
        },
        body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      throw new AppError(502, "SHIPPING_CARRIER_UNREACHABLE", "Shiprocket could not be reached. Please try again.", {
        path,
        error: String(error),
      });
    }

    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: response.status, ok: response.ok, body };
  }

  async function login(): Promise<string> {
    const result = await send("auth/login", { method: "POST", json: { email: config.email, password: config.password } });
    if (!result.ok) throw errorFor("auth/login", result);
    return loginSchema.parse(result.body).token;
  }

  /** The bearer token, cached in Redis until it expires; force skips the cache (e.g. after a 401). */
  async function authToken(force = false): Promise<string> {
    if (!force) {
      try {
        const cached = await redis.get(tokenKey);
        if (cached) return cached;
      } catch {
        // Redis down: fall through to a fresh login.
      }
    }
    const token = await login();
    try {
      await redis.set(tokenKey, token, "EX", TOKEN_TTL_SECONDS);
    } catch {
      // Caching is an optimisation; a failed write only means the next call logs in again.
    }
    return token;
  }

  /** A request with the bearer token; a 401 clears the cache and logs in once more. */
  async function authorized(path: string, init: { method?: string; json?: unknown } = {}): Promise<Result> {
    let result = await send(path, { ...init, token: await authToken() });
    if (result.status === 401) {
      try {
        await redis.del(tokenKey);
      } catch {
        // The forced login below refreshes the cache anyway.
      }
      result = await send(path, { ...init, token: await authToken(true) });
    }
    return result;
  }

  function trackingUrl(awb: string) {
    return `https://shiprocket.co/tracking/${encodeURIComponent(awb)}`;
  }

  return {
    name: "shiprocket",
    label: "Shiprocket",
    testMode: false,
    reportsTracking: true,

    async checkServiceability({ pickupPincode, deliveryPincode, weightGrams, cod }) {
      const params = new URLSearchParams({
        pickup_postcode: pickupPincode,
        delivery_postcode: deliveryPincode,
        cod: cod ? "1" : "0",
        weight: (Math.max(weightGrams, 1) / 1000).toFixed(3),
      });
      const result = await authorized(`courier/serviceability/?${params.toString()}`);
      if (!result.ok) throw errorFor("courier/serviceability", result);

      const couriers = serviceabilitySchema.parse(result.body).data?.available_courier_companies ?? [];
      const serviceable = couriers.length > 0;
      const codAvailable = couriers.some((courier) => courier.cod === true || courier.cod === 1 || courier.cod === "1");
      const etas = couriers
        .map((courier) => Number(courier.estimated_delivery_days))
        .filter((days) => Number.isFinite(days) && days > 0);
      return { serviceable, codAvailable, etaDays: etas.length ? Math.min(...etas) : null };
    },

    async createShipment(input: ShipmentInput): Promise<BookedShipment> {
      const result = await authorized("orders/create/adhoc", {
        method: "POST",
        json: {
          order_id: input.orderNumber,
          order_date: orderDate(input.orderDate),
          pickup_location: config.pickupLocation,
          billing_customer_name: input.delivery.name,
          billing_address: [input.delivery.addressLine1, input.delivery.addressLine2, input.delivery.landmark].filter(Boolean).join(", "),
          billing_city: input.delivery.city,
          billing_pincode: input.delivery.postalCode,
          billing_state: input.delivery.state,
          billing_country: "India",
          // The customer's email is not part of ShipmentAddress; Shiprocket accepts a blank one.
          billing_email: "",
          billing_phone: tenDigitPhone(input.delivery.phone),
          shipping_is_billing: true,
          order_items: input.items.map((item) => ({
            name: item.name,
            sku: item.sku,
            units: item.quantity,
            selling_price: Number(item.unitPrice.toString()),
          })),
          payment_method: input.codAmount.gt(0) ? "COD" : "Prepaid",
          sub_total: Number(input.orderTotal.toString()),
          length: Number(input.parcel.lengthCm.toString()),
          breadth: Number(input.parcel.breadthCm.toString()),
          height: Number(input.parcel.heightCm.toString()),
          weight: input.parcel.weightGrams / 1000,
        },
      });
      if (!result.ok) throw errorFor("orders/create/adhoc", result);

      const order = createOrderSchema.parse(result.body);
      return {
        providerOrderId: String(order.order_id),
        providerShipmentId: String(order.shipment_id),
        awb: order.awb_code ?? null,
        courierName: order.courier_name ?? null,
        trackingUrl: order.awb_code ? trackingUrl(order.awb_code) : null,
        status: ShipmentStatus.PENDING,
      };
    },

    async assignAwb(shipment: ShipmentRef) {
      const result = await authorized("courier/assign/awb", {
        method: "POST",
        json: { shipment_id: Number(shipment.providerShipmentId) },
      });
      if (!result.ok) throw errorFor("courier/assign/awb", result);

      const parsed = assignAwbSchema.parse(result.body);
      const awb = parsed.response?.data?.awb_code;
      if (parsed.awb_assign_status !== 1 || !awb) {
        throw new AppError(502, "SHIPPING_AWB_FAILED", "Shiprocket could not assign a courier and AWB for this order.", {
          shipment_id: shipment.providerShipmentId,
        });
      }
      return { awb, courierName: parsed.response?.data?.courier_name ?? null, trackingUrl: trackingUrl(awb) };
    },

    async schedulePickup(shipment: ShipmentRef) {
      const result = await authorized("courier/generate/pickup", {
        method: "POST",
        json: { shipment_id: [Number(shipment.providerShipmentId)] },
      });
      if (!result.ok) throw errorFor("courier/generate/pickup", result);

      const parsed = pickupSchema.parse(result.body);
      if (parsed.pickup_status !== 1) {
        throw new AppError(502, "SHIPPING_PICKUP_FAILED", "Shiprocket could not schedule a pickup for this order.", {
          shipment_id: shipment.providerShipmentId,
        });
      }
      return { status: ShipmentStatus.PICKUP_SCHEDULED };
    },

    async getLabel(shipment: ShipmentRef) {
      const result = await authorized("courier/generate/label", {
        method: "POST",
        json: { shipment_id: [Number(shipment.providerShipmentId)] },
      });
      if (!result.ok) throw errorFor("courier/generate/label", result);

      const parsed = labelSchema.parse(result.body);
      const labelUrl = parsed.label_url ?? parsed.response?.label_url;
      if (!labelUrl) {
        throw new AppError(502, "SHIPPING_LABEL_UNAVAILABLE", "Shiprocket did not return a label for this order.");
      }
      return { labelUrl };
    },

    async track(shipment: ShipmentRef): Promise<ShipmentEventInput[]> {
      const path = shipment.awb
        ? `courier/track/awb/${encodeURIComponent(shipment.awb)}`
        : shipment.providerShipmentId
          ? `courier/track/shipment/${encodeURIComponent(shipment.providerShipmentId)}`
          : null;
      if (!path) return [];

      const result = await authorized(path);
      if (!result.ok) throw errorFor(path, result);

      const data = trackingSchema.parse(result.body).tracking_data;
      if (!data || String(data.track_status) === "0") return [];

      return (data.shipment_track_activities ?? []).flatMap((activity): ShipmentEventInput[] => {
        const status = mapShiprocketStatus(activity.status);
        if (!status) return [];
        const occurredAt = parseDate(activity.date) ?? new Date();
        return [
          {
            status,
            providerEventId: `${shipment.awb ?? shipment.providerShipmentId}:${activity.date ?? occurredAt.toISOString()}:${activity.status ?? status}`,
            occurredAt,
            location: activity.location ?? null,
            description: [activity.status, activity.activity].filter(Boolean).join(" · ") || null,
          },
        ];
      });
    },

    async cancelShipment(shipment: ShipmentRef) {
      if (shipment.providerOrderId) {
        const result = await authorized("orders/cancel", {
          method: "POST",
          json: { ids: [Number(shipment.providerOrderId)] },
        });
        if (!result.ok) throw errorFor("orders/cancel", result);
        return;
      }
      if (shipment.awb) {
        const result = await authorized("orders/cancel/shipment/awbs", {
          method: "POST",
          json: { awbs: [shipment.awb] },
        });
        if (!result.ok) throw errorFor("orders/cancel/shipment/awbs", result);
        return;
      }
      throw new AppError(409, "SHIPMENT_NOT_CANCELLABLE", "This shipment has no Shiprocket order to cancel.");
    },

    parseWebhook(rawBody: string, headers): ShipmentWebhook | null {
      const token = headerValue(headers, SHIPROCKET_WEBHOOK_HEADER);
      if (!token || !safeEqual(token, config.webhookToken)) return null;

      let body: z.infer<typeof webhookSchema>;
      try {
        body = webhookSchema.parse(JSON.parse(rawBody));
      } catch {
        return { type: "ignored" };
      }
      if (!body.awb) return { type: "ignored" };

      // Prefer the status label; the numeric ids are not consistent between Shiprocket endpoints.
      const numericId = Number(body.shipment_status_id ?? body.current_status_id);
      const status =
        mapShiprocketStatus(body.shipment_status ?? body.current_status) ??
        mapShiprocketStatus(Number.isFinite(numericId) ? numericId : null);
      if (!status) return { type: "ignored" };

      const occurredAt = parseDate(body.current_timestamp ?? body.date) ?? new Date();
      const statusId = body.shipment_status_id ?? body.current_status_id ?? body.shipment_status ?? body.current_status;
      const location = [...(body.scans ?? [])].reverse().find((scan) => scan.location)?.location ?? null;

      return {
        type: "event",
        awb: body.awb,
        providerShipmentId: null,
        event: {
          status,
          providerEventId: `${body.awb}:${statusId}:${body.current_timestamp ?? body.date ?? occurredAt.toISOString()}`,
          occurredAt,
          location,
          description: body.current_status ?? body.shipment_status ?? null,
        },
      };
    },

    async checkCredentials() {
      try {
        return Boolean(await login());
      } catch {
        return false;
      }
    },
  } satisfies ShippingProvider;
}
