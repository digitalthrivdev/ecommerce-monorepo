import { PINCODE_PATTERN } from "@shop/validation";
import { z } from "zod";

import { stateSchema } from "../../shared/gst.js";
import { phoneSchema } from "../../shared/schemas.js";

const addressBodySchema = z.object({
  label: z.string().trim().min(1).max(30).nullish(),
  name: z.string().trim().min(1).max(100),
  phone: phoneSchema,
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: z.string().trim().max(200).nullish(),
  landmark: z.string().trim().max(200).nullish(),
  city: z.string().trim().min(1).max(100),
  state: stateSchema,
  postalCode: z.string().trim().regex(PINCODE_PATTERN, "Enter the 6-digit PIN code"),
  /** Optional map pin, for the courier. */
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  isDefault: z.boolean().optional(),
});

export const createAddressBodySchema = addressBodySchema;

export const updateAddressBodySchema = addressBodySchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Provide at least one field to update");

export type CreateAddressInput = z.infer<typeof createAddressBodySchema>;
export type UpdateAddressInput = z.infer<typeof updateAddressBodySchema>;
