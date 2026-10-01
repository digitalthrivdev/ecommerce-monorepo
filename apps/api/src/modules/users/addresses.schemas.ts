import { z } from "zod";

import { phoneSchema } from "../../shared/schemas.js";

const addressBodySchema = z.object({
  label: z.string().trim().min(1).max(30).nullish(),
  name: z.string().trim().min(1).max(100),
  phone: phoneSchema,
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: z.string().trim().max(200).nullish(),
  landmark: z.string().trim().max(200).nullish(),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(100),
  postalCode: z.string().trim().min(3).max(12),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  isDefault: z.boolean().optional(),
});

export const createAddressBodySchema = addressBodySchema;

export const updateAddressBodySchema = addressBodySchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Provide at least one field to update");

export type CreateAddressInput = z.infer<typeof createAddressBodySchema>;
export type UpdateAddressInput = z.infer<typeof updateAddressBodySchema>;
