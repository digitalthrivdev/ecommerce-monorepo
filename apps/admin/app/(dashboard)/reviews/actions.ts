"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { apiFailure, validationFailure } from "@/lib/action-errors";
import { apiFetch } from "@/lib/api";
import { formText, idSchema, text } from "@/lib/form-schemas";
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

const reviewSchema = z.object({
  productId: idSchema,
  authorName: text(40).min(1, "Enter the reviewer's name"),
  rating: z.coerce.number().int().min(1, "Choose a rating").max(5, "Choose a rating"),
  comment: text(500),
});

export async function addReview(formData: FormData): Promise<ActionResult> {
  const parsed = reviewSchema.safeParse({
    productId: formText(formData, "productId"),
    authorName: formText(formData, "authorName"),
    rating: formText(formData, "rating"),
    comment: formText(formData, "comment"),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  try {
    await apiFetch("/admin/reviews", { method: "POST", body: { ...parsed.data, comment: parsed.data.comment || null } });
  } catch (error) {
    return apiFailure(error);
  }

  refresh();
  return { ok: true, message: "Review added" };
}

export async function deleteReview(id: string): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Invalid request" };

  try {
    await apiFetch(`/admin/reviews/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch (error) {
    return apiFailure(error);
  }

  refresh();
  return { ok: true, message: "Review deleted" };
}
