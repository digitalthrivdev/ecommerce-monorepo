"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { apiFailure, validationFailure } from "@/lib/action-errors";
import { ApiError, apiFetch } from "@/lib/api";
import { getCurrentUser } from "@/lib/dal";
import { formText, optionalText, positiveDecimal } from "@/lib/form-schemas";
import { getAttention, listOrders } from "@/lib/orders";
import { MANUAL_TRACKING_STATUSES, type ActionResult, type AttentionList } from "@/lib/types";

const idSchema = z.string().trim().min(1).max(64);
const targetSchema = z.object({ orderId: idSchema });

/** Same limits as the API. */
const MAX_WEIGHT_GRAMS = 1_000_000;
const MAX_DIMENSION_CM = 10_000;

/** The order changed under the user (another tab, the courier); the page reloads to show it. */
const STALE_CODES = new Set([
  "ORDER_NOT_CANCELLABLE",
  "ORDER_NOT_PACKED",
  "SHIPMENT_ACTIVE",
  "SHIPMENT_EXISTS",
  "SHIPMENT_NOT_CANCELLABLE",
  "SHIPMENT_NOT_FOUND",
]);

/** Shown on the AWB field of the ship form. */
const AWB_CODES = new Set(["COURIER_DETAILS_REQUIRED", "AWB_IN_USE"]);

/** `form` keeps the API's field errors for a form; buttons get one message for a toast. */
function failure(error: unknown, form = false): Extract<ActionResult, { ok: false }> {
  if (!(error instanceof ApiError)) throw error;
  if (error.code === "INVALID_STATUS_TRANSITION" || error.code === "ORDER_ITEMS_LOCKED") {
    refresh();
    return { ok: false, error: "This order has already moved on. The page now shows its current status." };
  }
  if (STALE_CODES.has(error.code)) refresh();
  if (!form) return { ok: false, error: error.issues?.[0]?.message ?? error.message };
  if (AWB_CODES.has(error.code)) return { ok: false, error: error.message, fieldErrors: { awb: error.message } };
  return apiFailure(error);
}

/** The API authorises every call with the session token; these actions only validate shape. */
async function run(path: string, body: unknown, message: string, form = false): Promise<ActionResult> {
  try {
    await apiFetch(path, { method: "POST", body });
  } catch (error) {
    return failure(error, form);
  }
  refresh();
  return { ok: true, message };
}

function orderPath(orderId: string, action: string) {
  return `/admin/orders/${encodeURIComponent(orderId)}/${action}`;
}

export async function confirmRtoReceipt({ orderId }: { orderId: string }): Promise<ActionResult> {
  const parsed = targetSchema.safeParse({ orderId });
  if (!parsed.success) return validationFailure(parsed.error);
  return run(orderPath(orderId, "rto/receive"), {}, "RTO received; inventory restored and any online payment refunded");
}

export async function packOrder(input: { orderId: string }): Promise<ActionResult> {
  const parsed = targetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  return run(orderPath(parsed.data.orderId, "pack"), {}, "Order marked as packed");
}

export type NewOrdersSnapshot = {
  count: number;
  latest: { id: string; orderNumber: string; customerName: string; total: string; itemCount: number } | null;
};

/** Polled by the new-order alert. */
export async function getNewOrders(): Promise<NewOrdersSnapshot> {
  const orders = await listOrders({ status: ["CONFIRMED"], sort: "newest", limit: 1, offset: 0 });
  const latest = orders.items[0];
  return {
    count: orders.total,
    latest: latest
      ? {
          id: latest.id,
          orderNumber: latest.orderNumber,
          customerName: latest.customerName,
          total: latest.total,
          itemCount: latest.itemCount,
        }
      : null,
  };
}

const cancelSchema = targetSchema.extend({
  reason: z.string().trim().min(1, "Enter a reason for cancelling").max(300, "Keep the reason under 300 characters"),
});

export async function cancelOrder(input: { orderId: string; reason: string }): Promise<ActionResult> {
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request" };
  const { orderId, reason } = parsed.data;
  return run(orderPath(orderId, "cancel"), { reason }, "Order cancelled");
}

const unavailableSchema = targetSchema.extend({
  itemId: idSchema,
  quantity: z.number().int().min(1),
});

export async function markItemUnavailable(input: {
  orderId: string;
  itemId: string;
  quantity: number;
}): Promise<ActionResult> {
  const parsed = unavailableSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose how many are unavailable" };
  const { orderId, itemId, quantity } = parsed.data;
  return run(orderPath(orderId, `items/${encodeURIComponent(itemId)}/unavailable`), { quantity }, "Item marked unavailable");
}

const dimension = positiveDecimal("Enter centimetres like 30 or 12.5").refine(
  (value) => Number(value) <= MAX_DIMENSION_CM,
  `Enter at most ${MAX_DIMENSION_CM} cm`,
);

const shipSchema = targetSchema
  .extend({
    weightGrams: z
      .string()
      .trim()
      .refine((value) => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= MAX_WEIGHT_GRAMS, "Enter the weight in whole grams")
      .transform(Number),
    lengthCm: dimension,
    breadthCm: dimension,
    heightCm: dimension,
    courierName: optionalText(100),
    awb: optionalText(40).refine((value) => value === null || /^[A-Za-z0-9-]{4,}$/.test(value), "Use 4 to 40 letters, digits and dashes"),
    trackingUrl: optionalText(500).refine(
      (value) => value === null || (/^https?:\/\/\S+$/.test(value) && URL.canParse(value)),
      "Enter a full link starting with https://",
    ),
  })
  .superRefine((body, ctx) => {
    if (body.awb && !body.courierName) ctx.addIssue({ code: "custom", path: ["courierName"], message: "Enter the courier's name too" });
    if (body.courierName && !body.awb) ctx.addIssue({ code: "custom", path: ["awb"], message: "Enter the AWB number too" });
  });

const SHIP_FIELDS = ["orderId", "weightGrams", "lengthCm", "breadthCm", "heightCm", "courierName", "awb", "trackingUrl"] as const;

export async function shipOrder(formData: FormData): Promise<ActionResult> {
  const parsed = shipSchema.safeParse(Object.fromEntries(SHIP_FIELDS.map((field) => [field, formText(formData, field)])));
  if (!parsed.success) return validationFailure(parsed.error);
  const { orderId, courierName, awb, trackingUrl, ...parcel } = parsed.data;

  // Auto-pack if order is still CONFIRMED so order can be shipped directly in one step
  try {
    await apiFetch(orderPath(orderId, "pack"), { method: "POST" });
  } catch {
    // If already packed, continue to shipment creation
  }

  return run(
    orderPath(orderId, "shipment"),
    { ...parcel, ...(courierName && awb ? { courierName, awb } : {}), ...(trackingUrl ? { trackingUrl } : {}) },
    "Order shipped",
    true,
  );
}

export async function cancelShipment(input: { orderId: string }): Promise<ActionResult> {
  const parsed = targetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  return run(orderPath(parsed.data.orderId, "shipment/cancel"), {}, "Shipment cancelled");
}

export async function fetchShipmentLabel(input: { orderId: string }): Promise<ActionResult> {
  const parsed = targetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  return run(orderPath(parsed.data.orderId, "shipment/label"), {}, "Label ready to print");
}

export async function syncShipmentTracking(input: { orderId: string }): Promise<ActionResult> {
  const parsed = targetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  return run(orderPath(parsed.data.orderId, "shipment/sync"), {}, "Tracking refreshed");
}

const trackingSchema = targetSchema.extend({
  status: z.enum(MANUAL_TRACKING_STATUSES, "Choose what happened"),
  location: optionalText(200),
  description: optionalText(500),
  /** Sent by the browser as an ISO time, so it is in the admin's own time zone. */
  occurredAt: z
    .string()
    .trim()
    .refine((value) => value === "" || !Number.isNaN(Date.parse(value)), "Enter a date and time")
    .transform((value) => value || null),
});

export async function addTrackingUpdate(formData: FormData): Promise<ActionResult> {
  const parsed = trackingSchema.safeParse({
    orderId: formText(formData, "orderId"),
    status: formText(formData, "status"),
    location: formText(formData, "location"),
    description: formText(formData, "description"),
    occurredAt: formText(formData, "occurredAt"),
  });
  if (!parsed.success) return validationFailure(parsed.error);
  const { orderId, ...update } = parsed.data;
  const body = Object.fromEntries(Object.entries(update).filter(([, value]) => value !== null));
  return run(orderPath(orderId, "shipment/events"), body, "Tracking update added", true);
}

/** Polled by the attention banner (admins only). */
export async function pollAttention(): Promise<AttentionList | null> {
  const user = await getCurrentUser();
  return user.role === "ADMIN" ? getAttention() : null;
}
