import type { Instrumentation } from "next";

// Error tracking turns on when SENTRY_DSN is set at runtime (deploy/.env), with no rebuild.
const enabled = () => process.env.NEXT_RUNTIME === "nodejs" && Boolean(process.env.SENTRY_DSN);

export async function register() {
  if (!enabled()) return;
  const { initErrorReporting } = await import("./lib/error-reporting");
  initErrorReporting(process.env.SENTRY_DSN!, "admin");
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (!enabled()) return;
  const { captureRequestError } = await import("@sentry/nextjs");
  captureRequestError(error, request, context);
};
