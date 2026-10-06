import { z } from "zod";

import { decimalSchema, phoneSchema } from "../../shared/schemas.js";
import { OTP_LENGTH } from "../auth/otp-provider.js";

export const updateSettingsBodySchema = z
  .object({
    deliveryFee: decimalSchema,
    freeDeliveryThreshold: decimalSchema.nullable(),
    minOrderValue: decimalSchema,
    deliveryPartnerFee: decimalSchema,
    supportPhone: phoneSchema.nullable(),
    supportEmail: z.email().max(200).nullable(),
    businessName: z.string().trim().min(1).max(200).nullable(),
    businessAddress: z.string().trim().min(1).max(500).nullable(),
    websiteTagline: z.string().trim().min(1).max(160).nullable(),
    playStoreUrl: z
      .url()
      .max(300)
      .refine((url) => url.startsWith("https://play.google.com/"), "Use the app's link on play.google.com")
      .nullable(),
    paymentProvider: z.string().trim().min(1).max(32).nullable(),
    otpProvider: z.string().trim().min(1).max(32).nullable(),
  })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, "Provide at least one setting to update");

export type UpdateSettingsInput = z.infer<typeof updateSettingsBodySchema>;

export const gatewayParamsSchema = z.object({
  gateway: z.string().min(1).max(32),
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
