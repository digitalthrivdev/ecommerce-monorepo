"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { apiFailure, validationFailure } from "@/lib/action-errors";
import { apiFetch } from "@/lib/api";
import { formChecked, formText, idSchema, optionalUrl, slugInput, text } from "@/lib/form-schemas";
import type { ActionResult } from "@/lib/types";

const brandSchema = z.object({
  id: idSchema.optional(),
  name: text(100).min(1, "Enter a name"),
  slug: slugInput,
  logoUrl: optionalUrl,
  isActive: z.boolean(),
});

export async function saveBrand(formData: FormData): Promise<ActionResult> {
  const parsed = brandSchema.safeParse({
    id: formText(formData, "id") || undefined,
    name: formText(formData, "name"),
    slug: formText(formData, "slug"),
    logoUrl: formText(formData, "logoUrl"),
    isActive: formChecked(formData, "isActive"),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const { id, slug, ...data } = parsed.data;
  const body = { ...data, ...(slug && { slug }) };

  try {
    await apiFetch(id ? `/brands/${encodeURIComponent(id)}` : "/brands", { method: id ? "PATCH" : "POST", body });
  } catch (error) {
    return apiFailure(error, { field: "slug", message: "Another brand already uses this name or slug" });
  }

  refresh();
  return { ok: true, message: id ? "Brand updated" : "Brand created" };
}
