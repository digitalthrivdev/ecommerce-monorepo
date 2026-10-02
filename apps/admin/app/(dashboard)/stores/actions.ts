"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { apiFailure, validationFailure } from "@/lib/action-errors";
import { ApiError, apiFetch } from "@/lib/api";
import {
  emailInput,
  formChecked,
  formText,
  idSchema,
  optionalPhoneInput,
  optionalText,
  passwordInput,
  phoneInput,
  positiveDecimal,
  text,
} from "@/lib/form-schemas";
import type { ActionResult, StaffMember, StoreDetails } from "@/lib/types";

const coordinate = (label: string, limit: number) =>
  z
    .string()
    .trim()
    .min(1, `Enter the ${label}`)
    .transform(Number)
    .pipe(
      z
        .number({ error: `Enter the ${label} as a number, like 12.9352` })
        .min(-limit, `The ${label} must be between -${limit} and ${limit}`)
        .max(limit, `The ${label} must be between -${limit} and ${limit}`),
    );

const storeSchema = z.object({
  id: idSchema.optional(),
  name: text(100).min(1, "Enter a name"),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,32}$/, "Use 2–32 letters, digits and dashes, e.g. BLR-KRM-01"),
  phone: optionalPhoneInput,
  addressLine1: text(200).min(1, "Enter the street address"),
  addressLine2: optionalText(200),
  city: text(100).min(1, "Enter the city"),
  state: text(100).min(1, "Enter the state"),
  postalCode: text(12).min(3, "Enter the postal code"),
  latitude: coordinate("latitude", 90),
  longitude: coordinate("longitude", 180),
  serviceRadiusKm: positiveDecimal("Enter the radius in km, like 3 or 2.5")
    .refine((value) => Number(value) <= 50, "Keep the radius at 50 km or less")
    .transform(Number),
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

export async function saveStore(formData: FormData): Promise<ActionResult> {
  const parsed = storeSchema.safeParse({
    id: formText(formData, "id") || undefined,
    name: formText(formData, "name"),
    code: formText(formData, "code"),
    phone: formText(formData, "phone").trim(),
    addressLine1: formText(formData, "addressLine1"),
    addressLine2: formText(formData, "addressLine2"),
    city: formText(formData, "city"),
    state: formText(formData, "state"),
    postalCode: formText(formData, "postalCode"),
    latitude: formText(formData, "latitude"),
    longitude: formText(formData, "longitude"),
    serviceRadiusKm: formText(formData, "serviceRadiusKm"),
    status: formChecked(formData, "active") ? "ACTIVE" : "INACTIVE",
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const { id, ...body } = parsed.data;

  let store: StoreDetails;
  try {
    store = await apiFetch<StoreDetails>(id ? `/stores/${encodeURIComponent(id)}` : "/stores", {
      method: id ? "PATCH" : "POST",
      body,
    });
  } catch (error) {
    return apiFailure(error, { field: "code", message: "Another store already uses this code" });
  }

  if (!id) {
    redirect(`/stores/${store.id}`);
  }
  refresh();
  return { ok: true, message: "Store updated" };
}

const addStaffSchema = z.object({
  storeId: idSchema,
  phone: phoneInput,
  email: emailInput,
  password: passwordInput,
  name: text(100),
});

export async function addStaff(formData: FormData): Promise<ActionResult> {
  const parsed = addStaffSchema.safeParse({
    storeId: formText(formData, "storeId"),
    phone: formText(formData, "phone"),
    email: formText(formData, "email"),
    password: formText(formData, "password"),
    name: formText(formData, "name"),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const { storeId, name, ...body } = parsed.data;
  let member: StaffMember;
  try {
    member = await apiFetch<StaffMember>(`/stores/${encodeURIComponent(storeId)}/staff`, {
      method: "POST",
      body: { ...body, ...(name && { name }) },
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      const field = error.code === "EMAIL_IN_USE" ? "email" : "phone";
      return { ok: false, error: error.message, fieldErrors: { [field]: error.message } };
    }
    return apiFailure(error);
  }

  refresh();
  return { ok: true, message: `${member.name ?? member.email} can now sign in with ${member.email}` };
}

const setStaffPasswordSchema = z.object({ storeId: idSchema, userId: idSchema, password: passwordInput });

export async function setStaffPassword(formData: FormData): Promise<ActionResult> {
  const parsed = setStaffPasswordSchema.safeParse({
    storeId: formText(formData, "storeId"),
    userId: formText(formData, "userId"),
    password: formText(formData, "password"),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const { storeId, userId, password } = parsed.data;
  try {
    await apiFetch(`/stores/${encodeURIComponent(storeId)}/staff/${encodeURIComponent(userId)}/password`, {
      method: "PUT",
      body: { password },
    });
  } catch (error) {
    return apiFailure(error);
  }

  refresh();
  return { ok: true, message: "Password set. Share it with them privately." };
}

const removeStaffSchema = z.object({ storeId: idSchema, userId: idSchema });

export async function removeStaff(input: z.input<typeof removeStaffSchema>): Promise<ActionResult> {
  const parsed = removeStaffSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };

  const { storeId, userId } = parsed.data;
  try {
    await apiFetch(`/stores/${encodeURIComponent(storeId)}/staff/${encodeURIComponent(userId)}`, { method: "DELETE" });
  } catch (error) {
    return apiFailure(error);
  }

  refresh();
  return { ok: true, message: "Staff member removed from the store" };
}
