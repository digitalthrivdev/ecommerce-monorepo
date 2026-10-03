"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { ApiError, apiFetch } from "@/lib/api";
import type { ActionResult, Paginated, StockChange } from "@/lib/types";

const MAX_STOCK = 1_000_000;
const idSchema = z.string().trim().min(1).max(64);
const targetSchema = z.object({ storeId: idSchema, variantId: idSchema });

function variantPath(base: "inventory" | "variants", storeId: string, variantId: string) {
  return `/stores/${encodeURIComponent(storeId)}/${base}/${encodeURIComponent(variantId)}`;
}

async function patch(path: string, body: unknown, message: string): Promise<ActionResult> {
  try {
    await apiFetch(path, { method: "PATCH", body });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.code === "INSUFFICIENT_STOCK") {
      const available = (error.details as { available?: number }[] | undefined)?.[0]?.available;
      return {
        ok: false,
        error: available === undefined ? error.message : `Only ${available} in stock. Remove ${available} or fewer.`,
      };
    }
    return { ok: false, error: error.issues?.[0]?.message ?? error.message };
  }
  refresh();
  return { ok: true, message };
}

const adjustSchema = targetSchema.extend({
  mode: z.enum(["add", "remove", "set"]),
  amount: z.coerce
    .number({ error: "Enter a whole number" })
    .int("Enter a whole number")
    .min(0, "Enter zero or more")
    .max(MAX_STOCK, `Enter ${MAX_STOCK.toLocaleString("en-IN")} or less`),
  reason: z.enum(["RESTOCK", "CORRECTION", "DAMAGE"]),
  note: z.string().trim().max(300, "Keep the note under 300 characters"),
});

/**
 * Add and remove are relative, so they stay correct while orders reserve stock at the same
 * time. Set count overwrites the quantity and is meant for physical stock counts.
 */
export async function adjustStock(input: z.input<typeof adjustSchema>): Promise<ActionResult> {
  const parsed = adjustSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request" };
  const { storeId, variantId, mode, amount, reason, note } = parsed.data;

  if (mode !== "set" && amount === 0) {
    return { ok: false, error: "Enter a quantity greater than zero" };
  }

  const change = mode === "set" ? { quantity: amount } : { delta: mode === "add" ? amount : -amount };
  const message = mode === "set" ? `Stock set to ${amount}` : mode === "add" ? `Added ${amount} to stock` : `Removed ${amount} from stock`;
  return patch(variantPath("inventory", storeId, variantId), { ...change, reason, ...(note && { note }) }, message);
}

const availabilitySchema = targetSchema.extend({ isAvailable: z.boolean() });

export async function setAvailability(input: z.input<typeof availabilitySchema>): Promise<ActionResult> {
  const parsed = availabilitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const { storeId, variantId, isAvailable } = parsed.data;
  return patch(
    variantPath("variants", storeId, variantId),
    { isAvailable },
    isAvailable ? "Now selling" : "Not selling now",
  );
}

export type StockHistoryResult = { ok: true; history: Paginated<StockChange> } | { ok: false; error: string };

/** The latest stock changes of a variant at a store. */
export async function getStockHistory(input: z.input<typeof targetSchema>): Promise<StockHistoryResult> {
  const parsed = targetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const { storeId, variantId } = parsed.data;

  try {
    const history = await apiFetch<Paginated<StockChange>>(`${variantPath("inventory", storeId, variantId)}/adjustments`, {
      query: { limit: 50 },
    });
    return { ok: true, history };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return { ok: false, error: error.message };
  }
}
