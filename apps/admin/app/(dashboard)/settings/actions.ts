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

const gatewayName = z.string().trim().min(1).max(32);

/** Field names come from the gateway's definition on the server, which validates them. */
export async function saveGatewayKeys(formData: FormData): Promise<ActionResult> {
  const gateway = gatewayName.safeParse(formText(formData, "gateway"));
  if (!gateway.success) return { ok: false, error: "Unknown payment gateway" };

  const credentials: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key !== "gateway" && !key.startsWith("$") && typeof value === "string") credentials[key] = value;
  }

  try {
    await apiFetch(`/settings/payment-gateways/${encodeURIComponent(gateway.data)}`, {
      method: "PUT",
      body: { credentials },
    });
  } catch (error) {
    return apiFailure(error);
  }

  refresh();
  return { ok: true, message: "Gateway keys saved" };
}

export async function removeGatewayKeys(input: { gateway: string }): Promise<ActionResult> {
  const gateway = gatewayName.safeParse(input.gateway);
  if (!gateway.success) return { ok: false, error: "Unknown payment gateway" };

  try {
    await apiFetch(`/settings/payment-gateways/${encodeURIComponent(gateway.data)}`, { method: "DELETE" });
  } catch (error) {
    return apiFailure(error);
  }

  refresh();
  return { ok: true, message: "Gateway keys removed" };
}

const gatewaySchema = z.object({
  paymentProvider: z
    .string()
    .trim()
    .max(32)
    .transform((value) => value || null),
});

export async function updatePaymentGateway(formData: FormData): Promise<ActionResult> {
  const parsed = gatewaySchema.safeParse({ paymentProvider: formText(formData, "paymentProvider") });
  if (!parsed.success) return validationFailure(parsed.error);

  try {
    await apiFetch("/settings/platform", { method: "PATCH", body: parsed.data });
  } catch (error) {
    return apiFailure(error);
  }

  refresh();
  return {
    ok: true,
    message: parsed.data.paymentProvider ? "Online payments updated" : "Online payments turned off",
  };
}
