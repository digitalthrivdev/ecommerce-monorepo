"use server";

import { refresh } from "next/cache";

import { apiFailure } from "@/lib/action-errors";
import { apiFetch } from "@/lib/api";
import { formText } from "@/lib/form-schemas";
import type { ActionResult } from "@/lib/types";

/** The editor sends the whole appearance as JSON; the API validates every part. */
export async function saveAppearance(formData: FormData): Promise<ActionResult> {
  let config: unknown;
  try {
    config = JSON.parse(formText(formData, "config"));
  } catch {
    return { ok: false, error: "The changes could not be read. Reload the page and try again." };
  }
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    return { ok: false, error: "The changes could not be read. Reload the page and try again." };
  }

  try {
    await apiFetch("/settings/appearance", { method: "PATCH", body: config });
  } catch (error) {
    return apiFailure(error, undefined, { fullPaths: true });
  }

  refresh();
  return { ok: true, message: "Appearance saved. The apps pick it up the next time they open." };
}
