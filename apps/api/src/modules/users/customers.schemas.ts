import { z } from "zod";

import { CustomerBlock } from "../../generated/prisma/client";
import { paginationQuerySchema } from "../../shared/schemas.js";

export const listCustomersQuerySchema = paginationQuerySchema.extend({
  /** Name, phone number or email. */
  q: z
    .string()
    .trim()
    .max(50)
    .optional()
    .transform((value) => value || undefined),
  /** "blocked": blocked from COD or from ordering. */
  filter: z.enum(["blocked"]).optional(),
});

export const blockCustomerBodySchema = z
  .object({
    block: z.enum(CustomerBlock),
    reason: z.string().trim().min(1, "Enter a reason").max(300),
  })
  .strict();

export type BlockCustomerInput = z.infer<typeof blockCustomerBodySchema>;

export const customerOrdersQuerySchema = paginationQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
export type CustomerOrdersQuery = z.infer<typeof customerOrdersQuerySchema>;
