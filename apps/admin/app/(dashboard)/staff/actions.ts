"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { apiFailure, validationFailure } from "@/lib/action-errors";
import { ApiError, apiFetch } from "@/lib/api";
import { emailInput, formText, idSchema, passwordInput, phoneInput, text } from "@/lib/form-schemas";
import type { ActionResult, StaffMember } from "@/lib/types";

const staffPath = (userId: string) => `/staff/${encodeURIComponent(userId)}`;

const addStaffSchema = z.object({
  phone: phoneInput,
  email: emailInput,
  password: passwordInput,
  name: text(100),
});

export async function addStaff(formData: FormData): Promise<ActionResult> {
  const parsed = addStaffSchema.safeParse({
    phone: formText(formData, "phone"),
    email: formText(formData, "email"),
    password: formText(formData, "password"),
    name: formText(formData, "name"),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const { name, ...body } = parsed.data;
  let member: StaffMember;
  try {
    member = await apiFetch<StaffMember>("/staff", { method: "POST", body: { ...body, ...(name && { name }) } });
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      const field = error.code === "EMAIL_IN_USE" ? "email" : "phone";
      return { ok: false, error: error.message, fieldErrors: { [field]: error.message } };
    }
    return apiFailure(error);
  }

  refresh();
  return { ok: true, message: `${member.name ?? body.email} can now sign in with ${body.email}` };
}

const setStaffPasswordSchema = z.object({ userId: idSchema, password: passwordInput });

export async function setStaffPassword(formData: FormData): Promise<ActionResult> {
  const parsed = setStaffPasswordSchema.safeParse({
    userId: formText(formData, "userId"),
    password: formText(formData, "password"),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const { userId, password } = parsed.data;
  try {
    await apiFetch(`${staffPath(userId)}/password`, { method: "PUT", body: { password } });
  } catch (error) {
    return apiFailure(error);
  }

  refresh();
  return { ok: true, message: "Password set. Share it with them privately." };
}

const removeStaffSchema = z.object({ userId: idSchema });

export async function removeStaff(input: z.input<typeof removeStaffSchema>): Promise<ActionResult> {
  const parsed = removeStaffSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };

  try {
    await apiFetch(staffPath(parsed.data.userId), { method: "DELETE" });
  } catch (error) {
    return apiFailure(error);
  }

  refresh();
  return { ok: true, message: "Staff member removed" };
}
