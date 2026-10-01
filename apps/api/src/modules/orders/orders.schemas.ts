import { z } from "zod";

import { OrderStatus, PaymentMethod } from "../../generated/prisma/client";
import { paginationQuerySchema } from "../../shared/schemas.js";

export const createOrderBodySchema = z.object({
  addressId: z.string().trim().min(1).max(64),
  paymentMethod: z.enum(PaymentMethod),
});

export const listOrdersQuerySchema = paginationQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(OrderStatus).optional(),
});

/** Store staff and admin order lists. */
export const manageOrdersQuerySchema = paginationQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  /** One status or a comma-separated list, e.g. `PICKING,PACKED`. */
  status: z
    .string()
    .transform((value) => [...new Set(value.split(",").map((status) => status.trim()).filter(Boolean))])
    .pipe(z.array(z.enum(OrderStatus)).min(1))
    .optional(),
  q: z.string().trim().min(1).max(50).optional(),
  sort: z.enum(["newest", "oldest"]).default("newest"),
});

export const cancelOrderBodySchema = z
  .object({
    reason: z.string().trim().min(1).max(300).optional(),
  })
  .default({});

export type CreateOrderInput = z.infer<typeof createOrderBodySchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
