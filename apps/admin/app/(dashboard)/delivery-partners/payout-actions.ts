"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { apiFailure, validationFailure } from "@/lib/action-errors";
import { ApiError, apiFetch } from "@/lib/api";
import { getPublicSettings } from "@/lib/dal";
import { todayIn } from "@/lib/format";
import { formText, idSchema, optionalText, positiveDecimal, text } from "@/lib/form-schemas";
import type { ActionResult } from "@/lib/types";

/** Noon on that day in the business time zone, so the date never shifts when shown elsewhere. */
function noonIn(date: string, timeZone: string) {
  const guess = new Date(`${date}T12:00:00Z`);
  const offset = new Date(guess.toLocaleString("en-US", { timeZone })).getTime() - new Date(guess.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  return new Date(guess.getTime() - offset).toISOString();
}

const payoutSchema = z.object({
  partnerId: idSchema,
  amount: positiveDecimal("Enter the amount paid, like 500 or 499.50"),
  method: z.enum(["CASH", "UPI", "BANK_TRANSFER", "OTHER"], "Choose how you paid"),
  note: optionalText(200),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the payment date"),
});

export async function recordPayout(formData: FormData): Promise<ActionResult> {
  const parsed = payoutSchema.safeParse({
    partnerId: formText(formData, "partnerId"),
    amount: formText(formData, "amount"),
    method: formText(formData, "method"),
    note: formText(formData, "note"),
    paidOn: formText(formData, "paidOn"),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const { partnerId, amount, method, note, paidOn } = parsed.data;
  const { timezone } = await getPublicSettings();
  const today = todayIn(timezone);
  if (paidOn > today) {
    return { ok: false, error: "Check the highlighted fields", fieldErrors: { paidOn: "The payment date can't be in the future" } };
  }

  try {
    await apiFetch(`/delivery-partners/${encodeURIComponent(partnerId)}/payouts`, {
      method: "POST",
      body: { amount, method, ...(note && { note }), ...(paidOn !== today && { paidAt: noonIn(paidOn, timezone) }) },
    });
  } catch (error) {
    if (error instanceof ApiError && error.code === "PAYOUT_EXCEEDS_UNPAID") {
      return { ok: false, error: error.message, fieldErrors: { amount: error.message } };
    }
    return apiFailure(error);
  }

  refresh();
  return { ok: true, message: "Payout recorded" };
}

const voidSchema = z.object({
  payoutId: idSchema,
  reason: text(300).min(1, "Say why this payout is being voided"),
});

export async function voidPayout(formData: FormData): Promise<ActionResult> {
  const parsed = voidSchema.safeParse({ payoutId: formText(formData, "payoutId"), reason: formText(formData, "reason") });
  if (!parsed.success) return validationFailure(parsed.error);

  try {
    await apiFetch(`/delivery-partners/payouts/${encodeURIComponent(parsed.data.payoutId)}/void`, {
      method: "POST",
      body: { reason: parsed.data.reason },
    });
  } catch (error) {
    return apiFailure(error);
  }

  refresh();
  return { ok: true, message: "Payout voided" };
}
