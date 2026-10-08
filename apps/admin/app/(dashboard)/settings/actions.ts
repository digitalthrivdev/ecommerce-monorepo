"use server";

import { refresh } from "next/cache";
import { GST_RATE_PATTERN } from "@grocery/validation";
import { z } from "zod";

import { apiFailure, validationFailure } from "@/lib/action-errors";
import { ApiError, apiFetch } from "@/lib/api";
import {
  decimal,
  formChecked,
  formText,
  optionalDecimal,
  optionalEmail,
  optionalGstin,
  optionalPositiveDecimal,
  optionalPhoneInput,
  optionalText,
  text,
} from "@/lib/form-schemas";
import type { ActionResult } from "@/lib/types";

const AMOUNT = "Enter an amount like 25 or 25.50";

/** Same range as the API. Empty hides the promise in the app. */
const deliveryPromiseMinutes = z
  .string()
  .trim()
  .refine((value) => value === "" || (/^\d{1,3}$/.test(value) && Number(value) >= 5 && Number(value) <= 180), "Enter minutes from 5 to 180")
  .transform((value) => (value ? Number(value) : null));

const settingsSchema = z.object({
  deliveryFee: decimal(AMOUNT),
  freeDeliveryThreshold: optionalDecimal(AMOUNT),
  minOrderValue: decimal(AMOUNT),
  codMaxOrderValue: optionalPositiveDecimal("Enter an amount above 0, or leave it empty for no limit"),
  deliveryPartnerFee: decimal(AMOUNT),
  riderCashLimit: optionalPositiveDecimal("Enter an amount above 0, or leave it empty for no limit"),
  deliveryPromiseMinutes,
  supportPhone: optionalPhoneInput,
  supportEmail: optionalEmail,
});

export async function updatePlatformSettings(formData: FormData): Promise<ActionResult> {
  const parsed = settingsSchema.safeParse({
    deliveryFee: formText(formData, "deliveryFee"),
    freeDeliveryThreshold: formText(formData, "freeDeliveryThreshold"),
    minOrderValue: formText(formData, "minOrderValue"),
    codMaxOrderValue: formText(formData, "codMaxOrderValue"),
    deliveryPartnerFee: formText(formData, "deliveryPartnerFee"),
    riderCashLimit: formText(formData, "riderCashLimit"),
    deliveryPromiseMinutes: formText(formData, "deliveryPromiseMinutes"),
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

const playStoreUrl = optionalText(300).refine(
  (url) => url === null || /^https:\/\/play\.google\.com\/\S+$/.test(url),
  "Paste the app's link from play.google.com",
);
const appStoreUrl = optionalText(300).refine(
  (url) => url === null || /^https:\/\/apps\.apple\.com\/\S+$/.test(url),
  "Paste the app's link from apps.apple.com",
);
const downloadUrl = optionalText(500).refine(
  (url) => url === null || (/^https:\/\/\S+$/.test(url) && URL.canParse(url)),
  "Enter a full link starting with https://",
);

const websiteSchema = z.object({
  businessName: optionalText(200),
  businessAddress: optionalText(500),
  websiteTagline: optionalText(160),
});

const APP_LINK_FIELDS = ["playStoreUrl", "appStoreUrl", "appDownloadUrl", "deliveryPlayStoreUrl", "deliveryAppStoreUrl", "deliveryDownloadUrl"] as const;

const appLinksSchema = z.object({
  playStoreUrl,
  appStoreUrl,
  appDownloadUrl: downloadUrl,
  deliveryPlayStoreUrl: playStoreUrl,
  deliveryAppStoreUrl: appStoreUrl,
  deliveryDownloadUrl: downloadUrl,
});

export async function updateAppLinks(formData: FormData): Promise<ActionResult> {
  const parsed = appLinksSchema.safeParse(Object.fromEntries(APP_LINK_FIELDS.map((field) => [field, formText(formData, field)])));
  if (!parsed.success) return validationFailure(parsed.error);

  try {
    await apiFetch("/settings/platform", { method: "PATCH", body: parsed.data });
  } catch (error) {
    return apiFailure(error);
  }

  refresh();
  return { ok: true, message: "App links saved" };
}

export async function updateWebsiteDetails(formData: FormData): Promise<ActionResult> {
  const parsed = websiteSchema.safeParse({
    businessName: formText(formData, "businessName"),
    businessAddress: formText(formData, "businessAddress"),
    websiteTagline: formText(formData, "websiteTagline"),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  try {
    await apiFetch("/settings/platform", { method: "PATCH", body: parsed.data });
  } catch (error) {
    return apiFailure(error);
  }

  refresh();
  return { ok: true, message: "Website details saved" };
}

const invoiceSchema = z.object({
  businessName: optionalText(200),
  gstin: optionalGstin,
  deliveryFeeGstRate: z
    .string()
    .trim()
    .regex(GST_RATE_PATTERN, "Enter a percentage like 18 or 5"),
});

export async function updateInvoiceSettings(formData: FormData): Promise<ActionResult> {
  const parsed = invoiceSchema.safeParse({
    businessName: formText(formData, "businessName"),
    gstin: formText(formData, "gstin"),
    deliveryFeeGstRate: formText(formData, "deliveryFeeGstRate"),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  try {
    await apiFetch("/settings/platform", { method: "PATCH", body: parsed.data });
  } catch (error) {
    return apiFailure(error);
  }

  refresh();
  return { ok: true, message: "Invoice details saved" };
}

const reviewLoginSchema = z.object({
  enabled: z.boolean(),
  phone: optionalPhoneInput,
  code: z
    .string()
    .trim()
    .regex(/^(\d{6})?$/, "Use 6 digits")
    .transform((value) => value || undefined),
});

export async function saveReviewLogin(formData: FormData): Promise<ActionResult> {
  const parsed = reviewLoginSchema.safeParse({
    enabled: formChecked(formData, "enabled"),
    phone: formText(formData, "phone"),
    code: formText(formData, "code"),
  });
  if (!parsed.success) return validationFailure(parsed.error);
  if (parsed.data.enabled && !parsed.data.phone) {
    return { ok: false, error: "Check the highlighted fields", fieldErrors: { phone: "Enter the phone number reviewers will use" } };
  }

  try {
    await apiFetch("/settings/review-login", { method: "PUT", body: parsed.data });
  } catch (error) {
    if (error instanceof ApiError && error.code === "REVIEW_PHONE_NOT_CUSTOMER") {
      return { ok: false, error: error.message, fieldErrors: { phone: error.message } };
    }
    if (error instanceof ApiError && error.code === "REVIEW_CODE_REQUIRED") {
      return { ok: false, error: error.message, fieldErrors: { code: error.message } };
    }
    return apiFailure(error);
  }

  refresh();
  return { ok: true, message: parsed.data.enabled ? "Review login is on" : "Review login is off" };
}

const policySlug = z.string().trim().min(1).max(32);

const policySchema = z.object({
  slug: policySlug,
  body: text(50_000).min(1, "Write the page text"),
});

export async function savePolicyPage(formData: FormData): Promise<ActionResult> {
  const parsed = policySchema.safeParse({ slug: formText(formData, "slug"), body: formText(formData, "body") });
  if (!parsed.success) return validationFailure(parsed.error);

  try {
    await apiFetch(`/settings/policy-pages/${encodeURIComponent(parsed.data.slug)}`, { method: "PUT", body: { body: parsed.data.body } });
  } catch (error) {
    return apiFailure(error);
  }

  refresh();
  return { ok: true, message: "Page saved" };
}

export async function restorePolicyTemplate(input: { slug: string }): Promise<ActionResult> {
  const slug = policySlug.safeParse(input.slug);
  if (!slug.success) return { ok: false, error: "Unknown page" };

  try {
    await apiFetch(`/settings/policy-pages/${encodeURIComponent(slug.data)}`, { method: "DELETE" });
  } catch (error) {
    return apiFailure(error);
  }

  refresh();
  return { ok: true, message: "Template restored" };
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
