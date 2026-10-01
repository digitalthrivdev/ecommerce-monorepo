"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { ApiError, apiFetch } from "@/lib/api";
import type { OrderAction } from "@/lib/types";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

const idSchema = z.string().trim().min(1).max(64);
const targetSchema = z.object({ storeId: idSchema, orderId: idSchema });

const SUCCESS: Record<OrderAction, string> = {
  accept: "Order accepted",
  "start-picking": "Picking started",
  pack: "Order marked as packed",
  ready: "Order is ready for pickup",
  assign: "Delivery partner assigned",
  reassign: "Delivery partner reassigned",
  cancel: "Order cancelled",
};

/** The API authorises every call with the session token; these actions only validate shape. */
async function run(path: string, body: unknown, action: OrderAction): Promise<ActionResult> {
  try {
    await apiFetch(path, { method: "POST", body });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.code === "INVALID_STATUS_TRANSITION") {
      // Someone else changed the order first; show its current state.
      refresh();
      return { ok: false, error: "This order has already moved on. The page now shows its current status." };
    }
    return { ok: false, error: error.issues?.[0]?.message ?? error.message };
  }
  refresh();
  return { ok: true, message: SUCCESS[action] };
}

function orderPath(storeId: string, orderId: string, action: string) {
  return `/stores/${encodeURIComponent(storeId)}/orders/${encodeURIComponent(orderId)}/${action}`;
}

const advanceSchema = targetSchema.extend({ action: z.enum(["accept", "start-picking", "pack", "ready"]) });

export async function advanceOrder(input: { storeId: string; orderId: string; action: string }): Promise<ActionResult> {
  const parsed = advanceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const { storeId, orderId, action } = parsed.data;
  return run(orderPath(storeId, orderId, action), {}, action);
}

const cancelSchema = targetSchema.extend({
  reason: z.string().trim().min(1, "Enter a reason for cancelling").max(300, "Keep the reason under 300 characters"),
});

export async function cancelOrder(input: { storeId: string; orderId: string; reason: string }): Promise<ActionResult> {
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request" };
  const { storeId, orderId, reason } = parsed.data;
  return run(orderPath(storeId, orderId, "cancel"), { reason }, "cancel");
}

const assignSchema = targetSchema.extend({
  partnerId: idSchema,
  mode: z.enum(["assign", "reassign"]),
});

export async function assignPartner(input: {
  storeId: string;
  orderId: string;
  partnerId: string;
  mode: "assign" | "reassign";
}): Promise<ActionResult> {
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a delivery partner" };
  const { storeId, orderId, partnerId, mode } = parsed.data;
  return run(orderPath(storeId, orderId, mode), { partnerId }, mode);
}
