"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { apiFailure, validationFailure } from "@/lib/action-errors";
import { ApiError, apiFetch } from "@/lib/api";
import { formText, idSchema, optionalText, positiveDecimal, text } from "@/lib/form-schemas";
import type { ActionResult } from "@/lib/types";

const depositSchema = z.object({
  partnerId: idSchema,
  amount: positiveDecimal("Enter the amount received, like 500 or 499.50"),
  note: optionalText(200),
});

export async function recordDeposit(formData: FormData): Promise<ActionResult> {
  const parsed = depositSchema.safeParse({
    partnerId: formText(formData, "partnerId"),
    amount: formText(formData, "amount"),
    note: formText(formData, "note"),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const { partnerId, amount, note } = parsed.data;
  try {
    await apiFetch(`/rider-cash/${encodeURIComponent(partnerId)}/deposits`, {
      method: "POST",
      body: { amount, ...(note && { note }) },
    });
  } catch (error) {
    if (error instanceof ApiError && error.code === "DEPOSIT_EXCEEDS_CASH") {
      return { ok: false, error: error.message, fieldErrors: { amount: error.message } };
    }
    return apiFailure(error);
  }

  refresh();
  return { ok: true, message: "Deposit recorded" };
}

const voidSchema = z.object({
  depositId: idSchema,
  reason: text(300).min(1, "Say why this deposit is being voided"),
});

export async function voidDeposit(formData: FormData): Promise<ActionResult> {
  const parsed = voidSchema.safeParse({ depositId: formText(formData, "depositId"), reason: formText(formData, "reason") });
  if (!parsed.success) return validationFailure(parsed.error);

  try {
    await apiFetch(`/rider-cash/deposits/${encodeURIComponent(parsed.data.depositId)}/void`, {
      method: "POST",
      body: { reason: parsed.data.reason },
    });
  } catch (error) {
    return apiFailure(error);
  }

  refresh();
  return { ok: true, message: "Deposit voided" };
}
