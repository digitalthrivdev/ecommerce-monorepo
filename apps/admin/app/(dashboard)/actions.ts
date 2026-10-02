"use server";

import { redirect } from "next/navigation";

import { ApiError, apiFetch } from "@/lib/api";
import { clearSession } from "@/lib/session";

export async function signOut() {
  await clearSession();
  redirect("/login");
}

export type UploadImageResult = { ok: true; url: string } | { ok: false; error: string };

export async function uploadImage(formData: FormData): Promise<UploadImageResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose an image to upload" };
  }

  const body = new FormData();
  body.set("file", file);
  try {
    const { url } = await apiFetch<{ url: string }>("/images", { method: "POST", body });
    return { ok: true, url };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return { ok: false, error: error.message };
  }
}
