"use client";

import { useEffect } from "react";

import "./globals.css";

/** Replaces the whole page when rendering fails outside any other error boundary. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    // Does nothing when browser error reporting is off (no SENTRY_DSN).
    void import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error));
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center font-sans">
        <title>Something went wrong</title>
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="text-muted-foreground max-w-sm text-sm">The page could not be shown. Try again, or reload the page.</p>
        <button
          type="button"
          onClick={() => retry()}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
