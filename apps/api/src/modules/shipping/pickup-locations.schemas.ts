import { PINCODE_PATTERN } from "@shop/validation";
import { z } from "zod";

import { stateSchema } from "../../shared/gst.js";
import { emailSchema, phoneSchema } from "../../shared/schemas.js";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value === undefined ? undefined : value || null));

const pickupLocationBodySchema = z.object({
  name: z.string().trim().min(1).max(50),
  contactName: z.string().trim().min(1).max(100),
  phone: phoneSchema,
  email: emailSchema.nullish(),
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: optionalText(200),
  landmark: optionalText(200),
  city: z.string().trim().min(1).max(100),
  state: stateSchema,
  postalCode: z.string().trim().regex(PINCODE_PATTERN, "Enter the 6-digit PIN code"),
  /** Making a location the default unsets the previous one. */
  isDefault: z.boolean().optional(),
});

export const createPickupLocationBodySchema = pickupLocationBodySchema;

export const updatePickupLocationBodySchema = pickupLocationBodySchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Provide at least one field to update");

export type CreatePickupLocationInput = z.infer<typeof createPickupLocationBodySchema>;
export type UpdatePickupLocationInput = z.infer<typeof updatePickupLocationBodySchema>;
