import { z } from "zod";

import { decimalSchema, phoneSchema } from "../../shared/schemas.js";

export const updateSettingsBodySchema = z
  .object({
    deliveryFee: decimalSchema,
    freeDeliveryThreshold: decimalSchema.nullable(),
    minOrderValue: decimalSchema,
    deliveryPartnerFee: decimalSchema,
    supportPhone: phoneSchema.nullable(),
    supportEmail: z.email().max(200).nullable(),
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

/** Field names and rules come from the gateway's or provider's definition; blank secrets keep the saved value. */
export const saveGatewayKeysBodySchema = z.object({
  credentials: z.record(z.string().max(64), z.string().max(512)),
});
