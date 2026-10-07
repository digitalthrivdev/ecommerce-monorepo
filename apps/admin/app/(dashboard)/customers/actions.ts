"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { apiFailure, validationFailure } from "@/lib/action-errors";
import { apiFetch } from "@/lib/api";
import { formText, idSchema, text } from "@/lib/form-schemas";
import type { ActionResult } from "@/lib/types";

const blockSchema = z.object({
  customerId: idSchema,
  block: z.enum(["COD", "ALL"], "Choose what to block"),
  reason: text(300).min(1, "Say why, for other admins"),
});

export async function blockCustomer(formData: FormData): Promise<ActionResult> {
  const parsed = blockSchema.safeParse({
    customerId: formText(formData, "customerId"),
    block: formText(formData, "block"),
    reason: formText(formData, "reason"),
  });
  if (!parsed.success) return validationFailure(parsed.error);
  const { customerId, ...body } = parsed.data;

  try {
    await apiFetch(`/admin/customers/${encodeURIComponent(customerId)}/block`, { method: "PUT", body });
  } catch (error) {
    return apiFailure(error);
  }
  refresh();
  return { ok: true, message: body.block === "COD" ? "Cash on delivery blocked" : "Ordering blocked" };
}

export async function unblockCustomer(id: string): Promise<ActionResult> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  try {
    await apiFetch(`/admin/customers/${encodeURIComponent(parsed.data)}/block`, { method: "DELETE" });
  } catch (error) {
    return apiFailure(error);
  }
  refresh();
  return { ok: true, message: "Block removed" };
}

/** For deletion requests that come by email or phone instead of through the app. */
export async function deleteCustomer(id: string): Promise<ActionResult> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  try {
    await apiFetch(`/admin/customers/${encodeURIComponent(parsed.data)}`, { method: "DELETE" });
  } catch (error) {
    return apiFailure(error);
  }
  refresh();
  return { ok: true, message: "Account deleted" };
}
