import { z } from "zod";

import { gstinSchema } from "../../shared/gst.js";
import { decimalSchema, phoneSchema, positiveDecimalSchema } from "../../shared/schemas.js";
import { OTP_LENGTH } from "../auth/otp-provider.js";
import { gstRateSchema } from "../products/products.schemas.js";

const playStoreUrlSchema = z
  .url()
  .max(300)
  .refine((url) => url.startsWith("https://play.google.com/"), "Use the app's link on play.google.com")
  .nullable();

const appStoreUrlSchema = z
  .url()
  .max(300)
  .refine((url) => url.startsWith("https://apps.apple.com/"), "Use the app's link on apps.apple.com")
  .nullable();

const downloadUrlSchema = z
  .url()
  .max(500)
  .refine((url) => url.startsWith("https://"), "Use an https:// link")
  .nullable();

const weightSlabSchema = z.object({
  maxWeightGrams: z.number().int().positive().max(1_000_000),
  fee: decimalSchema,
});

export const updateSettingsBodySchema = z
  .object({
    shippingFee: decimalSchema,
    freeShippingThreshold: decimalSchema.nullable(),
    codFee: decimalSchema,
    weightSlabs: z.array(weightSlabSchema).max(20).nullable(),
    minOrderValue: decimalSchema,
    returnWindowDays: z.number().int().min(1).max(90),
    codMaxOrderValue: positiveDecimalSchema.nullable(),
    deliveryPromiseMinutes: z.number().int().min(5).max(180).nullable(),
    supportPhone: phoneSchema.nullable(),
    supportEmail: z.email().max(200).nullable(),
    businessName: z.string().trim().min(1).max(200).nullable(),
    businessAddress: z.string().trim().min(1).max(500).nullable(),
    gstin: gstinSchema.nullable(),
    shippingFeeGstRate: gstRateSchema,
    websiteTagline: z.string().trim().min(1).max(160).nullable(),
    playStoreUrl: playStoreUrlSchema,
    appStoreUrl: appStoreUrlSchema,
    appDownloadUrl: downloadUrlSchema,
    paymentProvider: z.string().trim().min(1).max(32).nullable(),
    otpProvider: z.string().trim().min(1).max(32).nullable(),
    shippingProvider: z.string().trim().min(1).max(32).nullable(),
  })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, "Provide at least one setting to update");

export type UpdateSettingsInput = z.infer<typeof updateSettingsBodySchema>;

export const gatewayParamsSchema = z.object({
  gateway: z.string().min(1).max(32),
});

export const carrierParamsSchema = z.object({
  carrier: z.string().min(1).max(32),
});

export const otpProviderParamsSchema = z.object({
  provider: z.string().min(1).max(32),
});

export const reviewLoginBodySchema = z
  .object({
    enabled: z.boolean(),
    phone: phoneSchema.nullable(),
    code: z
      .string()
      .regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), `Use ${OTP_LENGTH} digits`)
      .optional(),
  })
  .strict()
  .refine((body) => !body.enabled || body.phone, { message: "Enter the phone number reviewers will use", path: ["phone"] });

export type ReviewLoginInput = z.infer<typeof reviewLoginBodySchema>;

export const policyParamsSchema = z.object({
  slug: z.string().min(1).max(32),
});

export const savePolicyBodySchema = z
  .object({
    body: z.string().trim().min(1, "Write the page text").max(50_000),
  })
  .strict();

/** Field names and rules come from the gateway's or provider's definition; blank secrets keep the saved value. */
export const saveGatewayKeysBodySchema = z.object({
  credentials: z.record(z.string().max(64), z.string().max(512)),
});
