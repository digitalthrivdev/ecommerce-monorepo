"use server";

import { ApiError, apiFetch } from "@/lib/api";
import type { ImportJob, ImportPreview, ImportRowError } from "@/lib/types";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export type PreviewImportResult = { ok: true; preview: ImportPreview } | { ok: false; error: string };
export type StartImportResult =
  | { ok: true; job: ImportJob }
  | { ok: false; error: string; errors?: ImportRowError[]; errorCount?: number };
export type ImportStatusResult = { ok: true; job: ImportJob } | { ok: false; error: string };

async function readUpload(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file" };
  if (file.size > MAX_FILE_BYTES) return { error: "The file can be at most 5 MB" };
  return { body: { csv: await file.text() } };
}

/** Checks the file without saving anything. */
export async function previewImport(formData: FormData): Promise<PreviewImportResult> {
  const upload = await readUpload(formData);
  if (!upload.body) return { ok: false, error: upload.error };
  try {
    return { ok: true, preview: await apiFetch<ImportPreview>("/catalog-imports/preview", { method: "POST", body: upload.body }) };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return { ok: false, error: error.message };
  }
}

/** The API checks the file again before it starts; errors found then are returned like a preview's. */
export async function startImport(formData: FormData): Promise<StartImportResult> {
  const upload = await readUpload(formData);
  if (!upload.body) return { ok: false, error: upload.error };
  try {
    return { ok: true, job: await apiFetch<ImportJob>("/catalog-imports", { method: "POST", body: upload.body }) };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    const details = error.details as { errors?: ImportRowError[]; errorCount?: number } | undefined;
    return { ok: false, error: error.message, errors: details?.errors, errorCount: details?.errorCount };
  }
}

export async function getImportStatus(id: string): Promise<ImportStatusResult> {
  if (!/^[a-f0-9]{24}$/.test(id)) return { ok: false, error: "Unknown import" };
  try {
    return { ok: true, job: await apiFetch<ImportJob>(`/catalog-imports/${id}`) };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return { ok: false, error: error.message };
  }
}
