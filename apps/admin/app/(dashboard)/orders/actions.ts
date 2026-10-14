"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { ApiError, apiFetch } from "@/lib/api";
import { getCurrentUser } from "@/lib/dal";
import { getAttention, listOrders } from "@/lib/orders";
import type { ActionResult, AttentionList, OrderAction } from "@/lib/types";

const idSchema = z.string().trim().min(1).max(64);
const targetSchema = z.object({ orderId: idSchema });

const SUCCESS: Record<OrderAction, string> = {
  accept: "Order accepted",
  "start-picking": "Picking started",
  pack: "Order marked as packed",
  ready: "Order is ready to send",
  "out-for-delivery": "Order is out for delivery",
  "mark-delivered": "Order marked as delivered",
  cancel: "Order cancelled",
  "mark-unavailable": "Item marked unavailable",
  refund: "Refund issued",
};

/** The API authorises every call with the session token; these actions only validate shape. */
async function run(path: string, body: unknown, action: OrderAction): Promise<ActionResult> {
  try {
    await apiFetch(path, { method: "POST", body });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.code === "INVALID_STATUS_TRANSITION" || error.code === "ORDER_ITEMS_LOCKED") {
      // Someone else changed the order first; show its current state.
      refresh();
      return { ok: false, error: "This order has already moved on. The page now shows its current status." };
    }
    return { ok: false, error: error.issues?.[0]?.message ?? error.message };
  }
  refresh();
  return { ok: true, message: SUCCESS[action] };
}

function orderPath(orderId: string, action: string) {
  return `/admin/orders/${encodeURIComponent(orderId)}/${action}`;
}

const advanceSchema = targetSchema.extend({
  action: z.enum(["accept", "start-picking", "pack", "ready", "pack-ready", "out-for-delivery", "mark-delivered"]),
});

export async function advanceOrder(input: { orderId: string; action: string }): Promise<ActionResult> {
  const parsed = advanceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const { orderId, action } = parsed.data;
  if (action === "pack-ready") {
    const packed = await run(orderPath(orderId, "pack"), {}, "pack");
    if (!packed.ok) return packed;
    const ready = await run(orderPath(orderId, "ready"), {}, "ready");
    return ready.ok ? { ok: true, message: "Packed and ready to send" } : ready;
  }
  return run(orderPath(orderId, action), {}, action);
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
  return run(orderPath(orderId, "cancel"), { reason }, "cancel");
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
  return run(
    orderPath(orderId, `items/${encodeURIComponent(itemId)}/unavailable`),
    { quantity },
    "mark-unavailable",
  );
}

/** Polled by the attention banner (admins only). */
export async function pollAttention(): Promise<AttentionList | null> {
  const user = await getCurrentUser();
  return user.role === "ADMIN" ? getAttention() : null;
}
