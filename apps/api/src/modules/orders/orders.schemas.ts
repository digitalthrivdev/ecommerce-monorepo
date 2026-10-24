import { PINCODE_PATTERN } from "@shop/validation";
import { z } from "zod";

import { OrderStatus, PaymentMethod } from "../../generated/prisma/client";
import { stateSchema } from "../../shared/gst.js";
import { booleanQuery, paginationQuerySchema, phoneSchema } from "../../shared/schemas.js";

export const createOrderBodySchema = z.object({
  addressId: z.string().trim().min(1).max(64),
  paymentMethod: z.enum(PaymentMethod),
});

export const flexiblePhoneSchema = z
  .string()
  .trim()
  .transform((val) => {
    const cleaned = val.replace(/[\s-]/g, "");
    if (cleaned.startsWith("+")) return cleaned;
    if (cleaned.startsWith("91") && cleaned.length === 12) return `+${cleaned}`;
    if (/^[6-9]\d{9}$/.test(cleaned)) return `+91${cleaned}`;
    return cleaned;
  })
  .pipe(phoneSchema);

export const directOrderItemSchema = z.object({
  variantId: z.string().trim().min(1),
  quantity: z.number().int().min(1).max(50),
});

export const directOrderCustomerSchema = z.object({
  name: z
    .string()
    .trim()
    .max(100)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || undefined),
  phone: flexiblePhoneSchema.optional().or(z.literal("")).transform((v) => v || undefined),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email().max(200))
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
});

export const directOrderAddressSchema = z.object({
  addressLine1: z
    .string()
    .trim()
    .min(3, "Your address seems incomplete 🙏 Kindly add House/Flat No. & Street name.")
    .max(200),
  addressLine2: z.string().trim().max(200).nullish(),
  landmark: z.string().trim().max(100).nullish(),
  city: z.string().trim().min(1, "Please recheck your city & state to match the PIN code ✔️").max(100),
  state: stateSchema,
  postalCode: z.string().trim().regex(PINCODE_PATTERN, "Please enter a valid 6-digit PIN code to ensure smooth delivery 🚚"),
});

export const directOrderBodySchema = z.object({
  items: z.array(directOrderItemSchema).min(1, "At least one item is required"),
  customer: directOrderCustomerSchema.optional(),
  address: directOrderAddressSchema.optional(),
  addressId: z.string().trim().min(1).optional(),
  paymentMethod: z.enum(PaymentMethod),
  couponCode: z.string().trim().min(1).optional(),
  returnUrl: z.string().trim().url().optional(),
});

export type DirectOrderInput = z.infer<typeof directOrderBodySchema>;

export const listOrdersQuerySchema = paginationQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(OrderStatus).optional(),
  /** Only orders not yet delivered or cancelled, including those awaiting payment. */
  active: booleanQuery,
});

/** Staff and admin order lists. */
export const manageOrdersQuerySchema = paginationQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  /** One status or a comma-separated list, e.g. `CONFIRMED,PACKED`. */
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
