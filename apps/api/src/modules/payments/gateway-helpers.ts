import { createHmac, timingSafeEqual } from "node:crypto";

import type { Prisma } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";

export function hmacSha256(secret: string, value: string, encoding: "hex" | "base64" | "base64url") {
  return createHmac("sha256", secret).update(value).digest(encoding);
}

export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Amount in the currency's smallest unit (paise for INR), as gateways like Razorpay expect. */
export function toMinorUnits(amount: Prisma.Decimal) {
  return Number(amount.mul(100).toFixed(0));
}

export function headerValue(headers: Record<string, string | string[] | undefined>, name: string) {
  const value = headers[name];
  return typeof value === "string" ? value : undefined;
}

/** Thrown when a gateway is unreachable or rejects a request; the cause is logged, not shown. */
export class PaymentGatewayError extends AppError {
  readonly gatewayDetails: unknown;

  constructor(label: string, gatewayDetails: unknown) {
    super(502, "PAYMENT_GATEWAY_ERROR", `${label} could not process the request. Please try again.`);
    this.gatewayDetails = gatewayDetails;
  }
}

/** JSON request to a gateway API. Returns the status with the body so callers can handle known errors. */
export async function gatewayRequest<T>(label: string, url: string, init: RequestInit & { json?: unknown }) {
  const { json, headers, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      headers: { accept: "application/json", ...(json !== undefined && { "content-type": "application/json" }), ...headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new PaymentGatewayError(label, { url, error: String(error) });
  }

  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, ok: response.ok, body: body as T };
}

export async function gatewayJson<T>(label: string, url: string, init: RequestInit & { json?: unknown }) {
  const result = await gatewayRequest<T>(label, url, init);
  if (!result.ok) {
    throw new PaymentGatewayError(label, { url, status: result.status, body: result.body });
  }
  return result.body;
}

/** Safe to place inside an inline <script>: no "</script>", HTML comments or line separators survive. */
export function scriptJson(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** Minimal mobile page shown while the gateway's checkout loads, or with a short message. */
export function paymentPage({ title, message, body = "", head = "", brandColor = "#0C831F" }: {
  title: string;
  message: string;
  body?: string;
  head?: string;
  brandColor?: string;
}) {
  const color = /^#[0-9a-fA-F]{3,8}$/.test(brandColor) ? brandColor : "#0C831F";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f6f7f8; color: #1f2328; }
  main { text-align: center; padding: 32px 24px; max-width: 360px; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  p { color: #59636e; margin: 0 0 20px; line-height: 1.4; }
  button, .button { display: block; width: 100%; box-sizing: border-box; padding: 14px; margin-top: 12px; border-radius: 10px; border: 0; font-size: 16px; font-weight: 700; text-decoration: none; cursor: pointer; background: ${color}; color: #fff; }
  .secondary { background: #fff; color: #1f2328; border: 1px solid #d1d9e0; }
</style>
${head}
</head>
<body>
<main>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(message)}</p>
${body}
</main>
</body>
</html>`;
}
