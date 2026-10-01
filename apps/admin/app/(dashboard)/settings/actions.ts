"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { apiFailure, validationFailure } from "@/lib/action-errors";
import { apiFetch } from "@/lib/api";
import { decimal, formText, optionalDecimal, optionalEmail, optionalPhoneInput } from "@/lib/form-schemas";
import type { ActionResult } from "@/lib/types";

const AMOUNT = "Enter an amount like 25 or 25.50";

const settingsSchema = z.object({
  deliveryFee: decimal(AMOUNT),
  freeDeliveryThreshold: optionalDecimal(AMOUNT),
  minOrderValue: decimal(AMOUNT),
  deliveryPartnerFee: decimal(AMOUNT),
  supportPhone: optionalPhoneInput,
  supportEmail: optionalEmail,
});

export async function updatePlatformSettings(formData: FormData): Promise<ActionResult> {
  const parsed = settingsSchema.safeParse({
    deliveryFee: formText(formData, "deliveryFee"),
    freeDeliveryThreshold: formText(formData, "freeDeliveryThreshold"),
    minOrderValue: formText(formData, "minOrderValue"),
    deliveryPartnerFee: formText(formData, "deliveryPartnerFee"),
    supportPhone: formText(formData, "supportPhone"),
    supportEmail: formText(formData, "supportEmail"),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  try {
    await apiFetch("/settings/platform", { method: "PATCH", body: parsed.data });
  } catch (error) {
    return apiFailure(error);
  }

  refresh();
  return { ok: true, message: "Settings saved" };
}
