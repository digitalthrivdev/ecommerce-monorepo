import { z } from "zod";

import { ShipmentStatus } from "../../generated/prisma/client";
import { dimensionSchema, MAX_WEIGHT_GRAMS } from "../products/products.schemas.js";

/** The parcel as packed. Courier details are for the manual carrier, which needs them. */
export const shipOrderBodySchema = z
  .object({
    weightGrams: z.number().int().min(1).max(MAX_WEIGHT_GRAMS),
    lengthCm: dimensionSchema,
    breadthCm: dimensionSchema,
    heightCm: dimensionSchema,
    courierName: z.string().trim().min(1).max(100).optional(),
    awb: z
      .string()
      .trim()
      .min(4)
      .max(40)
      .regex(/^[A-Za-z0-9-]+$/, "Letters, digits and dashes only")
      .optional(),
    trackingUrl: z.url({ protocol: /^https?$/ }).max(500).optional(),
  })
  .refine((body) => !body.awb === !body.courierName, {
    message: "Enter both the courier name and the AWB number",
    path: ["awb"],
  });

export type ShipOrderBody = z.infer<typeof shipOrderBodySchema>;

/** Updates an admin can record by hand; booking and cancelling have their own actions. */
export const MANUAL_EVENT_STATUSES = [
  ShipmentStatus.PICKED_UP,
  ShipmentStatus.IN_TRANSIT,
  ShipmentStatus.OUT_FOR_DELIVERY,
  ShipmentStatus.NDR,
  ShipmentStatus.DELIVERED,
  ShipmentStatus.RTO_IN_TRANSIT,
  ShipmentStatus.RTO_DELIVERED,
  ShipmentStatus.LOST,
] as const;

export const shipmentEventBodySchema = z.object({
  status: z.enum(MANUAL_EVENT_STATUSES),
  location: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).max(500).optional(),
  occurredAt: z.coerce
    .date()
    .refine((date) => date.getTime() <= Date.now() + 60_000, "Cannot be in the future")
    .optional(),
});

export type ShipmentEventBody = z.infer<typeof shipmentEventBodySchema>;

export const carrierParamsSchema = z.object({
  carrier: z.string().min(1).max(32),
});
