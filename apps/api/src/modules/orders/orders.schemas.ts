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

export const cancelOrderBodySchema = z
  .object({
    reason: z.string().trim().min(1).max(300).optional(),
  })
  .default({});

export type CreateOrderInput = z.infer<typeof createOrderBodySchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
