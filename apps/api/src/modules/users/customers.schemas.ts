import { z } from "zod";

import { paginationQuerySchema } from "../../shared/schemas.js";

export const listCustomersQuerySchema = paginationQuerySchema.extend({
  /** Name, phone number or email. */
  q: z
    .string()
    .trim()
    .max(50)
    .optional()
    .transform((value) => value || undefined),
});

export const customerOrdersQuerySchema = paginationQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
export type CustomerOrdersQuery = z.infer<typeof customerOrdersQuerySchema>;
