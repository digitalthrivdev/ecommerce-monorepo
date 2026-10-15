import { z } from "zod";

import { ComplaintReason, ComplaintStatus, RefundMethod } from "../../generated/prisma/client";
import { paginationQuerySchema, positiveDecimalSchema } from "../../shared/schemas.js";

export const MAX_COMPLAINT_PHOTOS = 3;

const idSchema = z.string().trim().min(1).max(64);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);

export const createComplaintBodySchema = z
  .object({
    reason: z.enum(ComplaintReason),
    note: optionalText(1000),
    items: z
      .array(z.object({ orderItemId: idSchema, quantity: z.number().int().min(1).max(1000) }))
      .min(1, "Choose at least one item")
      .max(100)
      .refine((items) => new Set(items.map((item) => item.orderItemId)).size === items.length, "Each item can be chosen once"),
    photoUrls: z.array(z.url().max(500)).max(MAX_COMPLAINT_PHOTOS).default([]),
  })
  .refine((body) => body.reason !== ComplaintReason.OTHER || body.note, {
    message: "Describe the problem",
    path: ["note"],
  });

export const listComplaintsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(ComplaintStatus).optional(),
  /** Order number, customer name or phone. */
  q: optionalText(50),
});

const refundFields = {
  amount: positiveDecimalSchema,
  /** Required for cash-on-delivery orders (UPI or BANK_TRANSFER); online orders are always refunded through the gateway. */
  method: z.enum(RefundMethod).optional(),
  /** UPI or bank transaction reference, for cash-on-delivery refunds. */
  reference: optionalText(100),
};

export const resolveComplaintBodySchema = z.object({
  status: z.enum([ComplaintStatus.APPROVED, ComplaintStatus.REJECTED]),
  /** Shown to the customer. */
  note: z.string().trim().min(1).max(500),
});

export const reversePickupBodySchema = z.object({
  courierName: z.string().trim().min(1).max(100),
  awb: z.string().trim().min(1).max(100),
  trackingUrl: z.url().max(500).nullable().optional(),
});

export const bookReversePickupBodySchema = z.object({ email: z.email().max(200) });

export const receiveReturnBodySchema = z.object({
  amount: positiveDecimalSchema,
  method: z.enum(RefundMethod).optional(),
  reference: optionalText(100),
  note: z.string().trim().min(1).max(500),
});

export const orderRefundBodySchema = z.object({
  ...refundFields,
  reason: z.string().trim().min(1).max(500),
});

export type CreateComplaintInput = z.infer<typeof createComplaintBodySchema>;
export type ListComplaintsQuery = z.infer<typeof listComplaintsQuerySchema>;
export type ResolveComplaintInput = z.infer<typeof resolveComplaintBodySchema>;
export type OrderRefundInput = z.infer<typeof orderRefundBodySchema>;
