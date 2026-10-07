import * as Sentry from "@sentry/node";

import { env } from "../config/env.js";

// The free Sentry plan has a small monthly quota shared by every client, so a crash loop on one
// server must not use it up.
const MAX_EVENTS_PER_HOUR = 60;

let windowStart = 0;
let sentInWindow = 0;

function withinBudget() {
  const now = Date.now();
  if (now - windowStart > 60 * 60 * 1000) {
    windowStart = now;
    sentInWindow = 0;
  }
  sentInWindow += 1;
  return sentInWindow <= MAX_EVENTS_PER_HOUR;
}

const EMAIL = /[^\s@"'<>]+@[^\s@"'<>]+\.[a-z]{2,}/gi;
const PHONE = /\+?\d[\d -]{8,}\d/g;

function scrub(text: string | undefined) {
  return text?.replace(EMAIL, "[email]").replace(PHONE, "[number]");
}

function withoutQuery(url: unknown) {
  return typeof url === "string" ? url.split("?")[0] : undefined;
}

/** Starts error reporting when SENTRY_DSN is set. Call before the app is built. */
export function initErrorReporting() {
  if (!env.SENTRY_DSN) return;

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    sendDefaultPii: false,
    initialScope: { tags: { app: "api" } },
    beforeBreadcrumb(breadcrumb) {
      // Outgoing request URLs can carry phone numbers and provider keys in the query string.
      if (breadcrumb.data) {
        const { "http.query": _query, "http.fragment": _fragment, ...data } = breadcrumb.data;
        breadcrumb.data = { ...data, url: withoutQuery(data.url) };
      }
      return breadcrumb;
    },
    beforeSend(event) {
      if (!withinBudget()) return null;
      if (event.request) {
        event.request = { method: event.request.method, url: withoutQuery(event.request.url) };
      }
      delete event.user;
      event.message = scrub(event.message);
      for (const [key, value] of Object.entries(event.extra ?? {})) {
        if (typeof value === "string") event.extra![key] = scrub(value);
      }
      for (const exception of event.exception?.values ?? []) {
        exception.value = scrub(exception.value);
      }
      return event;
    },
  });
}

/**
 * Reports an error-level log line, as pino received it: `(error)`, `(error, message)`,
 * `({ err, ...context }, message)` or `(message)`.
 */
export function reportLoggedError(args: unknown[]) {
  if (!env.SENTRY_DSN) return;

  const [first, second] = args;
  const message = typeof second === "string" ? second : typeof first === "string" ? first : undefined;
  let error: unknown;
  let context: Record<string, unknown> = {};
  if (first instanceof Error) {
    error = first;
  } else if (first && typeof first === "object") {
    const { err, ...rest } = first as Record<string, unknown>;
    error = err;
    context = rest;
  }

  if (error instanceof Error) {
    Sentry.captureException(error, { extra: { ...context, ...(message && { log: message }) } });
  } else {
    Sentry.captureMessage(message ?? "Error logged", { level: "error", extra: { ...context, ...(error !== undefined && { err: String(error) }) } });
  }
}

/** Sends queued reports before the process exits. */
export async function flushErrorReports() {
  if (env.SENTRY_DSN) await Sentry.flush(2000);
}
