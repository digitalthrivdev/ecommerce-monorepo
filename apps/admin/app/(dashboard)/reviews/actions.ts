"use server";

import { refresh } from "next/cache";

import { apiFailure } from "@/lib/action-errors";
import { apiFetch } from "@/lib/api";
import { idSchema } from "@/lib/form-schemas";
import type { ActionResult } from "@/lib/types";

export async function setReviewHidden(id: string, isHidden: boolean): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success || typeof isHidden !== "boolean") return { ok: false, error: "Invalid request" };

  try {
    await apiFetch(`/admin/reviews/${encodeURIComponent(id)}`, { method: "PATCH", body: { isHidden } });
  } catch (error) {
    return apiFailure(error);
  }

  refresh();
  return { ok: true, message: isHidden ? "Review hidden from the app" : "Review shown in the app" };
}
