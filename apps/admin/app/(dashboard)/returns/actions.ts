"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { apiFailure, validationFailure } from "@/lib/action-errors";
import { ApiError, apiFetch } from "@/lib/api";
import { formText, idSchema, positiveDecimal, text } from "@/lib/form-schemas";
import type { ActionResult } from "@/lib/types";

const FIELD_FOR_ERROR: Record<string, string> = {
  REFUND_TOO_LARGE: "amount",
  REFUND_REFERENCE_REQUIRED: "reference",
  INVALID_REFUND_METHOD: "method",
};

function refundFailure(error: unknown): ActionResult {
  if (error instanceof ApiError && error.code && FIELD_FOR_ERROR[error.code]) {
    return { ok: false, error: error.message, fieldErrors: { [FIELD_FOR_ERROR[error.code]!]: error.message } };
  }
  return apiFailure(error);
}

const refundFields = {
  amount: positiveDecimal("Enter the amount to refund, like 84 or 84.50"),
  /** Empty for online payments, which always go back through the gateway. */
  method: z.enum(["", "UPI", "BANK_TRANSFER"]).transform((value) => value || undefined),
  reference: text(100).transform((value) => value || undefined),
};

function refundBody(formData: FormData) {
  return {
    amount: formText(formData, "amount"),
    method: formText(formData, "method"),
    reference: formText(formData, "reference"),
  };
}

function requireReference<T extends { method?: string; reference?: string }>(data: T): ActionResult | null {
  if (data.method && !data.reference) {
    return { ok: false, error: "Check the highlighted fields", fieldErrors: { reference: "Enter the UPI or bank transaction reference" } };
  }
  return null;
}

const complaintRefundSchema = z.object({
  complaintId: idSchema,
  ...refundFields,
  note: text(500).min(1, "Write a short message for the customer"),
});

export async function refundComplaint(formData: FormData): Promise<ActionResult> {
  const parsed = complaintRefundSchema.safeParse({
    complaintId: formText(formData, "complaintId"),
    note: formText(formData, "note"),
    ...refundBody(formData),
  });
  if (!parsed.success) return validationFailure(parsed.error);
  const { complaintId, ...body } = parsed.data;
  const missing = requireReference(body);
  if (missing) return missing;

  try {
  await apiFetch(`/admin/returns/${encodeURIComponent(complaintId)}/receive`, { method: "POST", body });
  } catch (error) {
    return refundFailure(error);
  }

  refresh();
  return { ok: true, message: "Return received and refund issued" };
}

const resolveSchema = z.object({
  complaintId: idSchema,
  status: z.enum(["APPROVED", "REJECTED"]),
  note: text(500).min(1, "Write a short message for the customer"),
});

export async function resolveComplaint(formData: FormData): Promise<ActionResult> {
  const parsed = resolveSchema.safeParse({
    complaintId: formText(formData, "complaintId"),
    status: formText(formData, "status"),
    note: formText(formData, "note"),
  });
  if (!parsed.success) return validationFailure(parsed.error);
  const { complaintId, ...body } = parsed.data;

  try {
    await apiFetch(`/admin/returns/${encodeURIComponent(complaintId)}/resolve`, { method: "POST", body });
  } catch (error) {
    return apiFailure(error);
  }

  refresh();
  return { ok: true, message: body.status === "REJECTED" ? "Return rejected" : "Return approved" };
}

const reversePickupSchema = z.object({
  complaintId: idSchema,
  courierName: text(100).min(1),
  awb: text(100).min(1),
  trackingUrl: text(500).transform((value) => value || undefined).pipe(z.union([z.url(), z.undefined()])),
});

export async function saveReversePickup(formData: FormData): Promise<ActionResult> {
  const parsed = reversePickupSchema.safeParse({
    complaintId: formText(formData, "complaintId"),
    courierName: formText(formData, "courierName"),
    awb: formText(formData, "awb"),
    trackingUrl: formText(formData, "trackingUrl"),
  });
  if (!parsed.success) return validationFailure(parsed.error);
  const { complaintId, ...body } = parsed.data;
  try {
    await apiFetch(`/admin/returns/${encodeURIComponent(complaintId)}/reverse-pickup`, { method: "POST", body });
  } catch (error) {
    return apiFailure(error);
  }
  refresh();
  return { ok: true, message: "Reverse pickup details saved" };
}

export async function bookReversePickup(formData: FormData): Promise<ActionResult> {
  const parsed = z.object({ complaintId: idSchema, email: z.email().max(200) }).safeParse({
    complaintId: formText(formData, "complaintId"), email: formText(formData, "email"),
  });
  if (!parsed.success) return validationFailure(parsed.error);
  try {
    await apiFetch(`/admin/returns/${encodeURIComponent(parsed.data.complaintId)}/reverse-pickup/book`, { method: "POST", body: { email: parsed.data.email } });
  } catch (error) {
    return apiFailure(error);
  }
  refresh();
  return { ok: true, message: "Reverse pickup booked with Shiprocket" };
}

const orderRefundSchema = z.object({
  orderId: idSchema,
  ...refundFields,
  reason: text(500).min(1, "Say why you're refunding"),
});

export async function refundOrder(formData: FormData): Promise<ActionResult> {
  const parsed = orderRefundSchema.safeParse({
    orderId: formText(formData, "orderId"),
    reason: formText(formData, "reason"),
    ...refundBody(formData),
  });
  if (!parsed.success) return validationFailure(parsed.error);
  const { orderId, ...body } = parsed.data;
  const missing = requireReference(body);
  if (missing) return missing;

  try {
    await apiFetch(`/admin/orders/${encodeURIComponent(orderId)}/refunds`, { method: "POST", body });
  } catch (error) {
    return refundFailure(error);
  }

  refresh();
  return { ok: true, message: "Refund issued" };
}
