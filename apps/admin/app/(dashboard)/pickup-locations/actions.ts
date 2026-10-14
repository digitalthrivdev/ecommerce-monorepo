"use server";

import { refresh } from "next/cache";
import { INDIAN_STATES, PINCODE_PATTERN } from "@shop/validation";
import { z } from "zod";

import { apiFailure, validationFailure } from "@/lib/action-errors";
import { ApiError, apiFetch } from "@/lib/api";
import { formChecked, formText, idSchema, optionalEmail, optionalText, phoneInput, text } from "@/lib/form-schemas";
import type { ActionResult } from "@/lib/types";

const locationPath = (id: string) => `/pickup-locations/${encodeURIComponent(id)}`;

const required = (max: number, message: string) => text(max).min(1, message);

const pickupLocationSchema = z.object({
  id: idSchema.optional(),
  name: required(50, "Enter a name, e.g. Main warehouse"),
  contactName: required(100, "Enter who hands over the parcels"),
  phone: phoneInput,
  email: optionalEmail,
  addressLine1: required(200, "Enter the address"),
  addressLine2: optionalText(200),
  landmark: optionalText(200),
  city: required(100, "Enter the city"),
  state: z.string().refine((state) => INDIAN_STATES.some(({ name }) => name === state), "Choose a state or union territory"),
  postalCode: z.string().trim().regex(PINCODE_PATTERN, "Enter the 6-digit PIN code"),
  isDefault: z.boolean(),
});

const NAME_TAKEN = "PICKUP_LOCATION_NAME_TAKEN";

function locationFailure(error: unknown) {
  if (error instanceof ApiError && error.code === NAME_TAKEN) {
    return { ok: false as const, error: error.message, fieldErrors: { name: error.message } };
  }
  return apiFailure(error);
}

export async function savePickupLocation(formData: FormData): Promise<ActionResult> {
  const parsed = pickupLocationSchema.safeParse({
    id: formText(formData, "id") || undefined,
    name: formText(formData, "name"),
    contactName: formText(formData, "contactName"),
    phone: formText(formData, "phone"),
    email: formText(formData, "email"),
    addressLine1: formText(formData, "addressLine1"),
    addressLine2: formText(formData, "addressLine2"),
    landmark: formText(formData, "landmark"),
    city: formText(formData, "city"),
    state: formText(formData, "state"),
    postalCode: formText(formData, "postalCode"),
    isDefault: formChecked(formData, "isDefault"),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const { id, isDefault, ...body } = parsed.data;
  try {
    // Unticking the default is refused by the API; another location must be made the default instead.
    const payload = isDefault ? { ...body, isDefault } : body;
    await apiFetch(id ? locationPath(id) : "/pickup-locations", { method: id ? "PATCH" : "POST", body: payload });
  } catch (error) {
    return locationFailure(error);
  }

  refresh();
  return { ok: true, message: id ? "Pickup location saved" : "Pickup location added" };
}

export async function setDefaultPickupLocation(input: { id: string }): Promise<ActionResult> {
  const parsed = idSchema.safeParse(input.id);
  if (!parsed.success) return { ok: false, error: "Invalid request" };

  try {
    await apiFetch(locationPath(parsed.data), { method: "PATCH", body: { isDefault: true } });
  } catch (error) {
    return locationFailure(error);
  }

  refresh();
  return { ok: true, message: "Default pickup location changed" };
}

export async function deletePickupLocation(input: { id: string }): Promise<ActionResult> {
  const parsed = idSchema.safeParse(input.id);
  if (!parsed.success) return { ok: false, error: "Invalid request" };

  try {
    await apiFetch(locationPath(parsed.data), { method: "DELETE" });
  } catch (error) {
    return locationFailure(error);
  }

  refresh();
  return { ok: true, message: "Pickup location deleted" };
}
