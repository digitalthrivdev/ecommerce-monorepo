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
  })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, "Provide at least one setting to update");

export type UpdateSettingsInput = z.infer<typeof updateSettingsBodySchema>;
