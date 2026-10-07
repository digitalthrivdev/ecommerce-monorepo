import * as Sentry from "@sentry/react-native";

/** Set per client in eas.json (EXPO_PUBLIC_SENTRY_DSN). Blank, or a development build, turns reporting off. */
const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();

// The free Sentry plan has a small monthly quota shared by every client, so one phone stuck in a
// crash loop must not use it up.
const MAX_EVENTS_PER_HOUR = 10;

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

export function initErrorReporting(app: string) {
  if (__DEV__ || !DSN) return;

  Sentry.init({
    dsn: DSN,
    sendDefaultPii: false,
    enableAutoSessionTracking: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    initialScope: { tags: { app } },
    beforeBreadcrumb(breadcrumb) {
      // Console output and typed text can contain addresses and phone numbers.
      if (breadcrumb.category === "console") return null;
      if (breadcrumb.data?.url) breadcrumb.data = { ...breadcrumb.data, url: withoutQuery(breadcrumb.data.url) };
      breadcrumb.message = scrub(breadcrumb.message);
      return breadcrumb;
    },
    beforeSend(event) {
      if (!withinBudget()) return null;
      if (event.request) event.request = { url: withoutQuery(event.request.url) };
      delete event.user;
      event.message = scrub(event.message);
      for (const exception of event.exception?.values ?? []) {
        exception.value = scrub(exception.value);
      }
      return event;
    },
  });
}
