import "server-only";

import type { z } from "zod";

import { ApiError } from "./api";
import type { ActionResult } from "./types";

type Failure = Extract<ActionResult, { ok: false }>;

/**
 * `fullPaths` keys errors by the whole path ("homeSections.2.title") for nested editors; by
 * default only the top-level field name is used.
 */
type ErrorOptions = { fullPaths?: boolean };

/** First message per field. */
function fieldErrorsFrom(issues: { path: string | PropertyKey[]; message: string }[], { fullPaths = false }: ErrorOptions = {}) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const parts = Array.isArray(issue.path) ? issue.path.map(String) : issue.path.split(".");
    const field = fullPaths ? parts.join(".") : (parts[0] ?? "");
    if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  return fieldErrors;
}

export function validationFailure(error: z.ZodError, options?: ErrorOptions): Failure {
  return { ok: false, error: "Check the highlighted fields", fieldErrors: fieldErrorsFrom(error.issues, options) };
}

/**
 * Converts an API error into a form result. Rethrows anything that is not an ApiError
 * (including Next.js redirects). `conflictField` names the field to blame for a 409 CONFLICT,
 * which the API returns for duplicate unique values such as slugs.
 */
export function apiFailure(error: unknown, conflict?: { field: string; message: string }, options?: ErrorOptions): Failure {
  if (!(error instanceof ApiError)) throw error;

  if (error.code === "CONFLICT" && conflict) {
    return { ok: false, error: conflict.message, fieldErrors: { [conflict.field]: conflict.message } };
  }
  if (error.issues?.length) {
    return { ok: false, error: "Check the highlighted fields", fieldErrors: fieldErrorsFrom(error.issues, options) };
  }
  return { ok: false, error: error.message };
}
