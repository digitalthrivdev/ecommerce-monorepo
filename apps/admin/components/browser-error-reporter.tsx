"use client";

import { useEffect } from "react";

/** Reports errors in the browser to Sentry. The SDK loads only when a DSN is set, so it stays out of the bundle otherwise. */
export function BrowserErrorReporter({ dsn }: { dsn: string }) {
  useEffect(() => {
    void import("@/lib/error-reporting").then(({ initErrorReporting }) => initErrorReporting(dsn, "admin", "browser"));
  }, [dsn]);
  return null;
}
