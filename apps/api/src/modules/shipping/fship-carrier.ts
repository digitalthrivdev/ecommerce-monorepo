import { z } from "zod";

import { ShipmentStatus } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import type {
  BookedShipment,
  ShipmentEventInput,
  ShipmentInput,
  ShipmentRef,
  ShipmentWebhook,
  ShippingProvider,
} from "./shipping-provider.js";

/**
 * Fship (https://www.fship.in), API v1.2.3.2: app.fship.in/upload/documents/api_document.pdf.
 * Endpoints, all under the base URL:
 *   POST /api/pincodeserviceability   destination pincode serviceability
 *   GET  /api/getallcourier           the courier list (also proves the key works)
 *   POST /api/createforwardorder      book: Fship assigns the waybill and API order id at once
 *   POST /api/registerpickup          register the pickup, which returns the pickup order id
 *   POST /api/shippinglabelbypickupid label, invoice and manifest PDFs
 *   POST /api/trackinghistory         every scan for a waybill
 *   POST /api/ShipmentSummary         the latest scan
 *   POST /api/cancelorder             cancel while the order is booked or manifested
 * Authentication is the static `signature` header holding the Client Key (Settings → API Details),
 * so there is no token to cache. Fship publishes no webhooks, so progress is read with `track`.
 * The pickup order id only comes back from registerpickup and the label is fetched with it, so the
 * pickup is registered while the shipment is booked: booking is the only step whose ids are saved.
 */
const PRODUCTION_BASE = "https://capi.fship.in";

/** The header Fship reads the Client Key from. */
export const FSHIP_SIGNATURE_HEADER = "signature";

type Result = { status: number; ok: boolean; body: unknown };

const envelopeSchema = z.object({ status: z.union([z.boolean(), z.number(), z.string()]).nullish() }).passthrough();

/** Fship's `status` field, which arrives as a boolean but is not documented as one. Null when absent. */
function bodyStatus(body: unknown): boolean | number | string | null {
  const parsed = envelopeSchema.safeParse(body);
  return parsed.success ? (parsed.data.status ?? null) : null;
}

function statusFlag(value: boolean | number | string | null): boolean | null {
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = value.trim().toLowerCase();
  if (!text) return null;
  return !["false", "0", "error", "failed", "fail"].includes(text);
}

/** Words Fship may use for "this pincode has no such service". The exact wording is undocumented. */
const DENIED = new Set(["0", "n", "no", "false", "na", "n/a", "unavailable", "not available", "not serviceable", "no service"]);
const ALLOWED = new Set(["1", "y", "yes", "true", "available", "cod available"]);

function denied(value: string | null | undefined) {
  return DENIED.has((value ?? "").trim().toLowerCase());
}

function allowed(value: string | null | undefined) {
  return ALLOWED.has((value ?? "").trim().toLowerCase());
}

const serviceabilitySchema = z
  .object({
    status: z.union([z.boolean(), z.number(), z.string()]).nullish(),
    pickup: z.string().nullish(),
    cod: z.string().nullish(),
  })
  .passthrough();

const createOrderSchema = z
  .object({
    apiorderid: z.union([z.number(), z.string()]),
    waybill: z.string().nullish(),
    route_code: z.string().nullish(),
    order_status: z.string().nullish(),
  })
  .passthrough();

const registerPickupSchema = z
  .object({
    apipickuporderids: z
      .array(z.object({ pickupOrderId: z.union([z.number(), z.string()]).nullish() }).passthrough())
      .nullish(),
  })
  .passthrough();

const summarySchema = z
  .object({
    summary: z
      .object({
        fulfilledby: z.string().nullish(),
        status: z.string().nullish(),
        location: z.string().nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();

const labelSchema = z.object({ labelfile: z.string().nullish() }).passthrough();

const trackingSchema = z
  .object({
    trackingdata: z
      .array(
        z
          .object({
            DateandTime: z.string().nullish(),
            Status: z.string().nullish(),
            Remark: z.string().nullish(),
            Location: z.string().nullish(),
          })
          .passthrough(),
      )
      .nullish(),
  })
  .passthrough();

const courierListSchema = z
  .array(z.object({ courierId: z.union([z.number(), z.string()]), courierName: z.string() }).passthrough());

/**
 * Fship reports shipment progress as free text. Map a label to our status, or null when we have no
 * equivalent (delayed, pickup error, …). The numeric `statuscode` / `statusid` ids belong to two
 * undocumented tables, so only the labels are used.
 */
export function mapFshipStatus(raw: string | null | undefined): ShipmentStatus | null {
  if (!raw) return null;
  const text = raw.toUpperCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (text.includes("RTO") || text.includes("RETURN TO ORIGIN") || text.includes("REVERSE")) {
    if (text.includes("DELIVER")) return ShipmentStatus.RTO_DELIVERED;
    if (text.includes("CANCEL")) return ShipmentStatus.CANCELLED;
    return ShipmentStatus.RTO_IN_TRANSIT;
  }
  if (text.includes("CANCEL")) return ShipmentStatus.CANCELLED;
  if (text.includes("LOST") || text.includes("DAMAG") || text.includes("DESTROY")) return ShipmentStatus.LOST;
  if (text.includes("PICKUP ERROR") || text.includes("PICKUP EXCEPTION") || text.includes("PICKUP FAIL")) return null;
  if (text.includes("UNDELIVER") || text.includes("NDR") || text.includes("EXCEPTION")) return ShipmentStatus.NDR;
  if (text.includes("OUT FOR DELIVERY")) return ShipmentStatus.OUT_FOR_DELIVERY;
  if (text.includes("DELIVER")) return ShipmentStatus.DELIVERED;
  if (text.includes("OUT FOR PICKUP")) return ShipmentStatus.PICKUP_SCHEDULED;
  if (text.includes("PICKED") || text.includes("PICKUP COMPLETE")) return ShipmentStatus.PICKED_UP;
  if (
    text.includes("PICKUP SCHEDUL") ||
    text.includes("PICKUP PENDING") ||
    text.includes("PICKUP QUEUE") ||
    text.includes("PICKUP REGISTER") ||
    text.includes("MANIFEST")
  ) {
    return ShipmentStatus.PICKUP_SCHEDULED;
  }
  if (text.includes("AWB ASSIGN") || text.includes("LABEL GENERAT") || text.includes("BOOKED")) return ShipmentStatus.AWB_ASSIGNED;
  if (
    text.includes("IN TRANSIT") ||
    text.includes("DISPATCH") ||
    text.includes("SHIPPED") ||
    text.includes("REACHED") ||
    text.includes("MISROUT") ||
    text.includes("INSCAN") ||
    text.includes("OUTSCAN") ||
    text.includes("HUB")
  ) {
    return ShipmentStatus.IN_TRANSIT;
  }
  if (text === "NEW" || text.startsWith("NEW ") || text.includes("PENDING")) return ShipmentStatus.PENDING;
  return null;
}

/** Fship scan times arrive as "YYYY-MM-DD HH:mm:ss" in IST, or as an ISO string in the summary. */
function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const text = value.trim();
  const ymd = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(text);
  if (ymd) return new Date(`${ymd[1]}-${ymd[2]}-${ymd[3]}T${ymd[4]}:${ymd[5]}:${ymd[6]}+05:30`);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function tenDigitPhone(phone: string) {
  return phone.replace(/\D/g, "").slice(-10);
}

function errorFor(path: string, result: Result) {
  return new AppError(502, "SHIPPING_CARRIER_ERROR", "Fship could not process the request. Please try again.", {
    path,
    status: result.status,
    body: result.body,
  });
}

/** Fship answers errors with HTTP 4xx/5xx, and `status: false` on a 200 when it did not do the work. */
function ensure(result: Result, path: string): unknown {
  if (!result.ok || statusFlag(bodyStatus(result.body)) === false) throw errorFor(path, result);
  return result.body;
}

/**
 * Fship as a ShippingProvider. Books the forward order, registers the pickup and reads the label,
 * then follows the carrier with `track` (Fship has no webhooks). `pickupAddressId` is the warehouse
 * address id from the Fship panel (Manage Warehouse), `clientKey` its Client Key.
 */
export function createFshipProvider(config: { clientKey: string; pickupAddressId: string; baseUrl?: string }): ShippingProvider {
  const base = (config.baseUrl ?? PRODUCTION_BASE).replace(/\/+$/, "");

  async function send(path: string, init: { method?: string; json?: unknown } = {}): Promise<Result> {
    let response: Response;
    try {
      response = await fetch(`${base}/api/${path}`, {
        method: init.method ?? "GET",
        headers: {
          accept: "application/json",
          [FSHIP_SIGNATURE_HEADER]: config.clientKey,
          ...(init.json !== undefined && { "content-type": "application/json" }),
        },
        body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      throw new AppError(502, "SHIPPING_CARRIER_UNREACHABLE", "Fship could not be reached. Please try again.", {
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

  async function registerPickup(waybill: string): Promise<string> {
    const parsed = registerPickupSchema.parse(await ensure(await send("registerpickup", { method: "POST", json: { waybills: [waybill] } }), "registerpickup"));
    const id = parsed.apipickuporderids?.[0]?.pickupOrderId;
    if (id === null || id === undefined || id === "") {
      throw new AppError(502, "SHIPPING_PICKUP_FAILED", "Fship could not register a pickup for this order.", { waybill });
    }
    return String(id);
  }

  /** The courier Fship routed the waybill to. Best effort: it can be blank until the pickup is scanned. */
  async function courierNameFor(waybill: string): Promise<string | null> {
    try {
      const result = await send("ShipmentSummary", { method: "POST", json: { waybill } });
      if (!result.ok || statusFlag(bodyStatus(result.body)) === false) return null;
      const name = summarySchema.parse(result.body).summary?.fulfilledby?.trim();
      return name || null;
    } catch {
      return null;
    }
  }

  async function cancelQuietly(waybill: string) {
    try {
      await send("cancelorder", { method: "POST", json: { reason: "Cancelled by the store", waybill } });
    } catch {
      // The booking would be left open at Fship; the failure below is what the caller sees.
    }
  }

  return {
    name: "fship",
    label: "Fship",
    testMode: false,
    reportsTracking: true,

    /** The API takes no weight or COD flag, so the answer is Fship's own pincode lookup. */
    async checkServiceability({ pickupPincode, deliveryPincode }) {
      const result = await send("pincodeserviceability", {
        method: "POST",
        json: { source_Pincode: pickupPincode, destination_Pincode: deliveryPincode },
      });
      if (!result.ok) throw errorFor("pincodeserviceability", result);

      const body = serviceabilitySchema.parse(result.body);
      return {
        serviceable: statusFlag(bodyStatus(body)) === true && !denied(body.pickup),
        codAvailable: allowed(body.cod),
        // This API returns no delivery estimate.
        etaDays: null,
      };
    },

    async createShipment(input: ShipmentInput): Promise<BookedShipment> {
      const address = [input.delivery.addressLine1, input.delivery.addressLine2].filter(Boolean).join(", ");
      const length = Number(input.parcel.lengthCm.toString());
      const breadth = Number(input.parcel.breadthCm.toString());
      const height = Number(input.parcel.heightCm.toString());
      const total = Number(input.orderTotal.toString());
      const codAmount = Number(input.codAmount.toString());

      const booked = createOrderSchema.parse(
        ensure(
          await send("createforwardorder", {
            method: "POST",
            json: {
              customer_Name: input.delivery.name,
              customer_Mobile: tenDigitPhone(input.delivery.phone),
              customer_Emailid: "",
              customer_Address: address,
              landMark: input.delivery.landmark ?? "",
              customer_Address_Type: "Home",
              customer_PinCode: input.delivery.postalCode,
              customer_City: input.delivery.city,
              orderId: input.orderNumber,
              // 1 collects cash, 2 is prepaid; Fship treats a zero cod amount as prepaid too.
              payment_Mode: input.codAmount.gt(0) ? 1 : 2,
              express_Type: "surface",
              is_Ndd: 0,
              order_Amount: total,
              tax_Amount: 0,
              extra_Charges: 0,
              total_Amount: total,
              cod_Amount: codAmount,
              shipment_Weight: Number((input.parcel.weightGrams / 1000).toFixed(3)),
              shipment_Length: length,
              shipment_Width: breadth,
              shipment_Height: height,
              volumetric_Weight: Number(((length * breadth * height) / 5000).toFixed(3)),
              pick_Address_ID: Number(config.pickupAddressId),
              return_Address_ID: 0,
              products: input.items.map((item) => ({
                productName: item.name,
                unitPrice: Number(item.unitPrice.toString()),
                quantity: item.quantity,
                sku: item.sku,
                hsnCode: item.hsn ?? "",
                taxRate: 0,
                productDiscount: 0,
              })),
              // A zero courier id lets Fship pick the courier from its own rates.
              courierId: 0,
            },
          }),
          "createforwardorder",
        ),
      );

      if (!booked.waybill) {
        throw new AppError(502, "SHIPPING_AWB_FAILED", "Fship did not assign a waybill for this order.", { orderId: input.orderNumber });
      }

      // The label needs the pickup order id, so the pickup is registered here rather than later.
      let pickupOrderId: string;
      try {
        pickupOrderId = await registerPickup(booked.waybill);
      } catch (error) {
        await cancelQuietly(booked.waybill);
        throw error;
      }

      return {
        providerOrderId: String(booked.apiorderid),
        providerShipmentId: pickupOrderId,
        awb: booked.waybill,
        courierName: await courierNameFor(booked.waybill),
        trackingUrl: null,
        // The service turns this into PICKUP_SCHEDULED through schedulePickup.
        status: ShipmentStatus.AWB_ASSIGNED,
      };
    },

    /** The pickup was registered while booking, so there is nothing left to schedule. */
    async schedulePickup() {
      return { status: ShipmentStatus.PICKUP_SCHEDULED };
    },

    /** Fship has no second AWB step: the waybill comes back with the booking. */
    async assignAwb(shipment: ShipmentRef) {
      if (!shipment.awb) {
        throw new AppError(502, "SHIPPING_AWB_FAILED", "Fship has no waybill for this shipment.", { shipment: shipment.providerOrderId });
      }
      return { awb: shipment.awb, courierName: null, trackingUrl: null };
    },

    async getLabel(shipment: ShipmentRef) {
      const pickupOrderId = Number(shipment.providerShipmentId);
      if (!shipment.providerShipmentId || !Number.isFinite(pickupOrderId)) {
        throw new AppError(502, "SHIPPING_LABEL_UNAVAILABLE", "Fship has no pickup order id for this shipment, so it has no label.", {
          shipment: shipment.providerOrderId,
        });
      }

      const parsed = labelSchema.parse(
        ensure(await send("shippinglabelbypickupid", { method: "POST", json: { pickupOrderId: [pickupOrderId] } }), "shippinglabelbypickupid"),
      );
      if (!parsed.labelfile) {
        throw new AppError(502, "SHIPPING_LABEL_UNAVAILABLE", "Fship did not return a label for this order.");
      }
      return { labelUrl: parsed.labelfile };
    },

    async track(shipment: ShipmentRef): Promise<ShipmentEventInput[]> {
      if (!shipment.awb) return [];

      const result = await send("trackinghistory", { method: "POST", json: { waybill: shipment.awb } });
      if (!result.ok) throw errorFor("trackinghistory", result);
      // Not booked yet, or no scans: either way there is nothing to record.
      if (statusFlag(bodyStatus(result.body)) === false) return [];

      const scans = trackingSchema.parse(result.body).trackingdata ?? [];
      return scans
        .flatMap((scan): ShipmentEventInput[] => {
          const status = mapFshipStatus(scan.Status);
          if (!status) return [];
          const occurredAt = parseDate(scan.DateandTime) ?? new Date();
          return [
            {
              status,
              providerEventId: `${shipment.awb}:${scan.DateandTime ?? occurredAt.toISOString()}:${scan.Status ?? status}`,
              occurredAt,
              location: scan.Location ?? null,
              description: [scan.Status, scan.Remark].filter(Boolean).join(" · ") || null,
            },
          ];
        })
        .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
    },

    async cancelShipment(shipment: ShipmentRef) {
      if (!shipment.awb) {
        throw new AppError(409, "SHIPMENT_NOT_CANCELLABLE", "This shipment has no Fship waybill to cancel.");
      }
      ensure(await send("cancelorder", { method: "POST", json: { reason: "Cancelled by the store", waybill: shipment.awb } }), "cancelorder");
    },

    /** Fship has no webhooks to register or sign (see the module comment). */
    parseWebhook(): ShipmentWebhook | null {
      return null;
    },

    async checkCredentials() {
      try {
        const result = await send("getallcourier");
        if (!result.ok) return false;
        const couriers = courierListSchema.safeParse(result.body);
        return couriers.success && couriers.data.length > 0;
      } catch {
        return false;
      }
    },
  } satisfies ShippingProvider;
}
