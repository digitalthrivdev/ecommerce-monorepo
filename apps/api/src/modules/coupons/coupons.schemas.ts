import { COUPON_CODE_PATTERN } from "@grocery/validation";
import { z } from "zod";

import { CouponDiscountType } from "../../generated/prisma/client";
import { decimalSchema, paginationQuerySchema, positiveDecimalSchema } from "../../shared/schemas.js";

/** Codes are case-insensitive for customers and stored uppercase. */
export const couponCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(COUPON_CODE_PATTERN, "Use 3 to 20 letters and numbers");

export const applyCouponBodySchema = z.object({
  // Anything a customer might type; an unknown code is answered with "not valid", not a validation error.
  code: z.string().trim().toUpperCase().min(1, "Enter a coupon code").max(40),
});

const limitSchema = z.number().int().min(1).max(1_000_000).nullable().default(null);

/** Dates are days in the client's time zone; the coupon works from the start of `startsOn` to the end of `endsOn`. */
export const couponBodySchema = z
  .object({
    code: couponCodeSchema,
    description: z
      .string()
      .trim()
      .max(200)
      .nullish()
      .transform((value) => value || null),
    discountType: z.enum(CouponDiscountType),
    discountValue: positiveDecimalSchema,
    maxDiscount: positiveDecimalSchema.nullable().default(null),
    minOrderValue: decimalSchema.default("0"),
    startsOn: z.iso.date().nullable().default(null),
    endsOn: z.iso.date().nullable().default(null),
    totalLimit: limitSchema,
    perCustomerLimit: limitSchema,
    firstOrderOnly: z.boolean().default(false),
    isActive: z.boolean().default(true),
  })
  .refine((body) => body.discountType !== CouponDiscountType.PERCENT || Number(body.discountValue) <= 100, {
    message: "A percentage can be at most 100",
    path: ["discountValue"],
  })
  .refine((body) => body.discountType === CouponDiscountType.PERCENT || body.maxDiscount === null, {
    message: "Only a percentage discount has a maximum",
    path: ["maxDiscount"],
  })
  .refine((body) => !body.startsOn || !body.endsOn || body.startsOn <= body.endsOn, {
    message: "The end date must be on or after the start date",
    path: ["endsOn"],
  });

export const listCouponsQuerySchema = paginationQuerySchema.extend({
  /** Part of the code. */
  q: z.string().trim().min(1).max(40).optional(),
});

export type CouponInput = z.infer<typeof couponBodySchema>;
export type ListCouponsQuery = z.infer<typeof listCouponsQuerySchema>;
