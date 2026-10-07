import * as Sentry from "@sentry/nextjs";

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

/** Server errors only: no browser SDK, no request headers, cookies, bodies or query strings. */
export function initErrorReporting(dsn: string, app: string) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    sendDefaultPii: false,
    initialScope: { tags: { app } },
    beforeBreadcrumb(breadcrumb) {
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
      const nextjs = event.contexts?.nextjs;
      if (nextjs) nextjs.request_path = withoutQuery(nextjs.request_path);
      delete event.user;
      event.message = scrub(event.message);
      for (const exception of event.exception?.values ?? []) {
        exception.value = scrub(exception.value);
      }
      return event;
    },
  });
}
