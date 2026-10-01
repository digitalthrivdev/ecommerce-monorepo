"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { apiFailure, validationFailure } from "@/lib/action-errors";
import { apiFetch } from "@/lib/api";
import { formChecked, formText, idSchema, optionalUrl, slugInput, text } from "@/lib/form-schemas";
import type { ActionResult } from "@/lib/types";

const categorySchema = z.object({
  id: idSchema.optional(),
  name: text(100).min(1, "Enter a name"),
  slug: slugInput,
  imageUrl: optionalUrl,
  sortOrder: z.coerce.number({ error: "Enter a whole number" }).int("Enter a whole number").min(0, "Enter 0 or more").max(10_000),
  isActive: z.boolean(),
});

export async function saveCategory(formData: FormData): Promise<ActionResult> {
  const parsed = categorySchema.safeParse({
    id: formText(formData, "id") || undefined,
    name: formText(formData, "name"),
    slug: formText(formData, "slug"),
    imageUrl: formText(formData, "imageUrl"),
    sortOrder: formText(formData, "sortOrder") || "0",
    isActive: formChecked(formData, "isActive"),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const { id, slug, ...data } = parsed.data;
  const body = { ...data, ...(slug && { slug }) };

  try {
    await apiFetch(id ? `/categories/${encodeURIComponent(id)}` : "/categories", { method: id ? "PATCH" : "POST", body });
  } catch (error) {
    return apiFailure(error, { field: "slug", message: "Another category already uses this slug" });
  }

  refresh();
  return { ok: true, message: id ? "Category updated" : "Category created" };
}
