"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { apiFailure, validationFailure } from "@/lib/action-errors";
import { ApiError, apiFetch } from "@/lib/api";
import { formChecked, formText, idSchema, optionalText, phoneInput, text } from "@/lib/form-schemas";
import type { ActionResult, DeliveryPartner } from "@/lib/types";

const vehicleFields = {
  vehicleType: optionalText(30),
  vehicleNumber: optionalText(20).transform((value) => value?.toUpperCase() ?? null),
};

const createPartnerSchema = z.object({
  phone: phoneInput,
  name: text(100).min(1, "Enter the partner's name"),
  ...vehicleFields,
});

export async function createPartner(formData: FormData): Promise<ActionResult> {
  const parsed = createPartnerSchema.safeParse({
    phone: formText(formData, "phone"),
    name: formText(formData, "name"),
    vehicleType: formText(formData, "vehicleType"),
    vehicleNumber: formText(formData, "vehicleNumber"),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const { vehicleType, vehicleNumber, ...rest } = parsed.data;
  let partner: DeliveryPartner;
  try {
    partner = await apiFetch<DeliveryPartner>("/delivery-partners", {
      method: "POST",
      body: { ...rest, ...(vehicleType && { vehicleType }), ...(vehicleNumber && { vehicleNumber }) },
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      return { ok: false, error: error.message, fieldErrors: { phone: error.message } };
    }
    return apiFailure(error);
  }

  redirect(`/delivery-partners/${partner.id}`);
}

const updatePartnerSchema = z.object({
  id: idSchema,
  name: text(100).min(1, "Enter the partner's name"),
  ...vehicleFields,
  isActive: z.boolean(),
});

export async function updatePartner(formData: FormData): Promise<ActionResult> {
  const parsed = updatePartnerSchema.safeParse({
    id: formText(formData, "id"),
    name: formText(formData, "name"),
    vehicleType: formText(formData, "vehicleType"),
    vehicleNumber: formText(formData, "vehicleNumber"),
    isActive: formChecked(formData, "isActive"),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const { id, ...body } = parsed.data;
  try {
    await apiFetch(`/delivery-partners/${encodeURIComponent(id)}`, { method: "PATCH", body });
  } catch (error) {
    if (error instanceof ApiError && error.code === "PARTNER_BUSY") {
      const message = "This partner is on a delivery. Reassign the order or wait until it is delivered, then deactivate.";
      return { ok: false, error: message, fieldErrors: { isActive: message } };
    }
    return apiFailure(error);
  }

  refresh();
  return { ok: true, message: "Partner updated" };
}
