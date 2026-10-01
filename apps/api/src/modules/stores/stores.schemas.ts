import { z } from "zod";

import { StoreStatus } from "../../generated/prisma/client";
import { booleanQuery, paginationQuerySchema, phoneSchema } from "../../shared/schemas.js";

const queryNumber = (min: number, max: number) =>
  z.string().trim().min(1).transform(Number).pipe(z.number().min(min).max(max));

const storeBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,32}$/, "Code must be 2-32 characters: letters, digits and dashes"),
  phone: phoneSchema.nullish(),
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: z.string().trim().max(200).nullish(),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(100),
  postalCode: z.string().trim().min(3).max(12),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  serviceRadiusKm: z.number().gt(0).max(50).optional(),
  status: z.enum(StoreStatus).optional(),
});

export const createStoreBodySchema = storeBodySchema;

export const updateStoreBodySchema = storeBodySchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Provide at least one field to update");

export const listStoresQuerySchema = paginationQuerySchema.extend({
  includeInactive: booleanQuery,
});

export const serviceabilityQuerySchema = z.object({
  latitude: queryNumber(-90, 90),
  longitude: queryNumber(-180, 180),
});

export type CreateStoreInput = z.infer<typeof createStoreBodySchema>;
export type UpdateStoreInput = z.infer<typeof updateStoreBodySchema>;
