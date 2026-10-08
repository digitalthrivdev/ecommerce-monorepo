"use server";

import { refresh } from "next/cache";
import { COUPON_CODE_PATTERN } from "@grocery/validation";
import { z } from "zod";

import { apiFailure, validationFailure } from "@/lib/action-errors";
import { apiFetch } from "@/lib/api";
import { decimal, formChecked, formText, idSchema, optionalPositiveDecimal, optionalText, positiveDecimal } from "@/lib/form-schemas";
import type { ActionResult } from "@/lib/types";

const optionalDay = z.union([z.literal("").transform(() => null), z.iso.date("Pick a date")]);
const optionalLimit = z
  .string()
  .trim()
  .refine((value) => value === "" || (/^\d{1,7}$/.test(value) && Number(value) >= 1 && Number(value) <= 1_000_000), "Enter a whole number from 1")
  .transform((value) => (value ? Number(value) : null));

const couponSchema = z
  .object({
    id: idSchema.optional(),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(COUPON_CODE_PATTERN, "Use 3 to 20 letters and numbers, no spaces"),
    description: optionalText(200),
    discountType: z.enum(["FLAT", "PERCENT"]),
    discountValue: positiveDecimal("Enter an amount above 0"),
    maxDiscount: optionalPositiveDecimal("Enter an amount above 0, or leave it empty"),
    minOrderValue: decimal("Enter an amount, or 0").or(z.literal("").transform(() => "0")),
    startsOn: optionalDay,
    endsOn: optionalDay,
    totalLimit: optionalLimit,
    perCustomerLimit: optionalLimit,
    firstOrderOnly: z.boolean(),
    isActive: z.boolean(),
  })
  .refine((coupon) => coupon.discountType !== "PERCENT" || Number(coupon.discountValue) <= 100, {
    message: "A percentage can be at most 100",
    path: ["discountValue"],
  })
  .refine((coupon) => !coupon.startsOn || !coupon.endsOn || coupon.startsOn <= coupon.endsOn, {
    message: "The last day must be on or after the first day",
    path: ["endsOn"],
  });

export async function saveCoupon(formData: FormData): Promise<ActionResult> {
  const discountType = formText(formData, "discountType");
  const parsed = couponSchema.safeParse({
    id: formText(formData, "id") || undefined,
    code: formText(formData, "code"),
    description: formText(formData, "description"),
    discountType,
    discountValue: formText(formData, "discountValue"),
    // Only a percentage has a maximum; the field is hidden for a flat amount.
    maxDiscount: discountType === "PERCENT" ? formText(formData, "maxDiscount") : "",
    minOrderValue: formText(formData, "minOrderValue"),
    startsOn: formText(formData, "startsOn"),
    endsOn: formText(formData, "endsOn"),
    totalLimit: formText(formData, "totalLimit"),
    perCustomerLimit: formText(formData, "perCustomerLimit"),
    firstOrderOnly: formChecked(formData, "firstOrderOnly"),
    isActive: formChecked(formData, "isActive"),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const { id, ...body } = parsed.data;
  try {
    await apiFetch(id ? `/admin/coupons/${encodeURIComponent(id)}` : "/admin/coupons", { method: id ? "PUT" : "POST", body });
  } catch (error) {
    return apiFailure(error, { field: "code", message: "Another coupon already uses this code" });
  }

  refresh();
  return { ok: true, message: id ? "Coupon updated" : "Coupon created" };
}
