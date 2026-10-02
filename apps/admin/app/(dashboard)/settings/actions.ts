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

const integrationName = z.string().trim().min(1).max(32);

/** Field names come from the gateway's or provider's definition on the server, which validates them. */
async function saveKeys(path: string, formData: FormData, unknown: string, message: string): Promise<ActionResult> {
  const name = integrationName.safeParse(formText(formData, "name"));
  if (!name.success) return { ok: false, error: unknown };

  const credentials: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key !== "name" && !key.startsWith("$") && typeof value === "string") credentials[key] = value;
  }

  try {
    await apiFetch(`${path}/${encodeURIComponent(name.data)}`, { method: "PUT", body: { credentials } });
  } catch (error) {
    return apiFailure(error);
  }

  refresh();
  return { ok: true, message };
}

async function removeKeys(path: string, input: { name: string }, unknown: string, message: string): Promise<ActionResult> {
  const name = integrationName.safeParse(input.name);
  if (!name.success) return { ok: false, error: unknown };

  try {
    await apiFetch(`${path}/${encodeURIComponent(name.data)}`, { method: "DELETE" });
  } catch (error) {
    return apiFailure(error);
  }

  refresh();
  return { ok: true, message };
}

export async function saveGatewayKeys(formData: FormData): Promise<ActionResult> {
  return saveKeys("/settings/payment-gateways", formData, "Unknown payment gateway", "Gateway keys saved");
}

export async function removeGatewayKeys(input: { name: string }): Promise<ActionResult> {
  return removeKeys("/settings/payment-gateways", input, "Unknown payment gateway", "Gateway keys removed");
}

export async function saveOtpProviderKeys(formData: FormData): Promise<ActionResult> {
  return saveKeys("/settings/otp-providers", formData, "Unknown SMS provider", "SMS provider keys saved");
}

export async function removeOtpProviderKeys(input: { name: string }): Promise<ActionResult> {
  return removeKeys("/settings/otp-providers", input, "Unknown SMS provider", "SMS provider keys removed");
}

const otpProviderSchema = z.object({
  otpProvider: z
    .string()
    .trim()
    .max(32)
    .transform((value) => value || null),
});

export async function updateOtpProvider(formData: FormData): Promise<ActionResult> {
  const parsed = otpProviderSchema.safeParse({ otpProvider: formText(formData, "otpProvider") });
  if (!parsed.success) return validationFailure(parsed.error);

  try {
    await apiFetch("/settings/platform", { method: "PATCH", body: parsed.data });
  } catch (error) {
    return apiFailure(error);
  }

  refresh();
  return { ok: true, message: parsed.data.otpProvider ? "SMS provider updated" : "SMS provider turned off" };
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
