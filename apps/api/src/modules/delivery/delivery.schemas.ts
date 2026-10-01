import { z } from "zod";

import { DeliveryPartnerStatus } from "../../generated/prisma/client";
import { paginationQuerySchema, phoneSchema } from "../../shared/schemas.js";

const idSchema = z.string().trim().min(1).max(64);
const vehicleType = z.string().trim().min(1).max(30);
const vehicleNumber = z.string().trim().min(1).max(20).toUpperCase();

export const partnerParamsSchema = z.object({ id: idSchema });

export const listPartnersQuerySchema = paginationQuerySchema.extend({
  status: z.enum(DeliveryPartnerStatus).optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export const createPartnerBodySchema = z.object({
  phone: phoneSchema,
  name: z.string().trim().min(1).max(100).optional(),
  vehicleType: vehicleType.optional(),
  vehicleNumber: vehicleNumber.optional(),
});

export const updatePartnerBodySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    vehicleType: vehicleType.nullable(),
    vehicleNumber: vehicleNumber.nullable(),
    isActive: z.boolean(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Provide at least one field to update");

export const assignBodySchema = z.object({ partnerId: idSchema });

export const partnerStatusBodySchema = z.object({
  status: z.enum([DeliveryPartnerStatus.ONLINE, DeliveryPartnerStatus.OFFLINE]),
});

export const deliveryOrderParamsSchema = z.object({ id: idSchema });

export const declineBodySchema = z
  .object({ reason: z.string().trim().min(1).max(300).optional() })
  .default({});

export const deliveredBodySchema = z.object({
  otp: z.string().trim().regex(/^\d{4}$/, "OTP must be 4 digits"),
});

export const locationBodySchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(10_000).optional(),
  heading: z.number().min(0).max(360).optional(),
  speed: z.number().min(0).max(100).optional(),
});

export const historyQuerySchema = paginationQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const earningsQuerySchema = z
  .object({
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
  })
  .transform(({ from, to }) => {
    const end = to ? new Date(to) : new Date();
    const start = from ? new Date(from) : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { from: start, to: end };
  })
  .refine(({ from, to }) => from < to, "from must be before to")
  .refine(({ from, to }) => to.getTime() - from.getTime() <= 92 * 24 * 60 * 60 * 1000, "Range can be at most 92 days");

export type CreatePartnerInput = z.infer<typeof createPartnerBodySchema>;
export type UpdatePartnerInput = z.infer<typeof updatePartnerBodySchema>;
export type LocationInput = z.infer<typeof locationBodySchema>;
