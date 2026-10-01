import "server-only";

import type { z } from "zod";

import { ApiError } from "./api";
import type { ActionResult } from "./types";

type Failure = Extract<ActionResult, { ok: false }>;

/** First message per field, keyed by the top-level field name. */
function fieldErrorsFrom(issues: { path: string | PropertyKey[]; message: string }[]) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const field = String(Array.isArray(issue.path) ? (issue.path[0] ?? "") : issue.path.split(".")[0]);
    if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  return fieldErrors;
}

export function validationFailure(error: z.ZodError): Failure {
  return { ok: false, error: "Check the highlighted fields", fieldErrors: fieldErrorsFrom(error.issues) };
}

/**
 * Converts an API error into a form result. Rethrows anything that is not an ApiError
 * (including Next.js redirects). `conflictField` names the field to blame for a 409 CONFLICT,
 * which the API returns for duplicate unique values such as slugs.
 */
export function apiFailure(error: unknown, conflict?: { field: string; message: string }): Failure {
  if (!(error instanceof ApiError)) throw error;

  if (error.code === "CONFLICT" && conflict) {
    return { ok: false, error: conflict.message, fieldErrors: { [conflict.field]: conflict.message } };
  }
  if (error.issues?.length) {
    return { ok: false, error: "Check the highlighted fields", fieldErrors: fieldErrorsFrom(error.issues) };
  }
  return { ok: false, error: error.message };
}
