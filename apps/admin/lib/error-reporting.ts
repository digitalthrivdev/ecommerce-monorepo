import * as Sentry from "@sentry/nextjs";

// The free Sentry plan has a small monthly quota shared by every client, so a crash loop on one
// server, or one browser tab stuck in an error loop, must not use it up.
const MAX_EVENTS_PER_HOUR = { server: 60, browser: 10 };

let windowStart = 0;
let sentInWindow = 0;

function withinBudget(limit: number) {
  const now = Date.now();
  if (now - windowStart > 60 * 60 * 1000) {
    windowStart = now;
    sentInWindow = 0;
  }
  sentInWindow += 1;
  return sentInWindow <= limit;
}

const EMAIL = /[^\s@"'<>]+@[^\s@"'<>]+\.[a-z]{2,}/gi;
const PHONE = /\+?\d[\d -]{8,}\d/g;

function scrub(text: string | undefined) {
  return text?.replace(EMAIL, "[email]").replace(PHONE, "[number]");
}

function withoutQuery(url: unknown) {
  return typeof url === "string" ? url.split("?")[0] : undefined;
}

/**
 * Server errors (from instrumentation.ts) and browser errors (from BrowserErrorReporter). No request
 * headers, cookies, bodies, query strings, console output or user details.
 */
export function initErrorReporting(dsn: string, app: string, runtime: "server" | "browser" = "server") {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    sendDefaultPii: false,
    initialScope: { tags: { app } },
    // Browser extensions and a harmless layout warning, not dashboard bugs.
    ignoreErrors: ["ResizeObserver loop"],
    denyUrls: [/^(chrome|moz|safari)-extension:\/\//],
    beforeBreadcrumb(breadcrumb) {
      // Console output can contain customers' addresses and phone numbers.
      if (breadcrumb.category === "console") return null;
      if (breadcrumb.data) {
        const { "http.query": _query, "http.fragment": _fragment, ...data } = breadcrumb.data;
        breadcrumb.data = { ...data, url: withoutQuery(data.url) };
      }
      breadcrumb.message = scrub(breadcrumb.message);
      return breadcrumb;
    },
    beforeSend(event) {
      if (!withinBudget(MAX_EVENTS_PER_HOUR[runtime])) return null;
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
