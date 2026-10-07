"use server";

import { refresh } from "next/cache";

import { apiFailure } from "@/lib/action-errors";
import { apiFetch } from "@/lib/api";
import { idSchema } from "@/lib/form-schemas";
import type { ActionResult } from "@/lib/types";

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
