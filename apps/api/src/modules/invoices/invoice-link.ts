import { env } from "../../config/env.js";
import { hmacSha256, safeEqual } from "../payments/gateway-helpers.js";

/**
 * Lets the customer app open an invoice in the phone's browser, which has no access token. Signed
 * with a key derived from JWT_SECRET and valid for a few minutes, so a shared link soon stops working.
 */
const key = hmacSha256(env.JWT_SECRET, "invoice-link-token", "hex");

export const INVOICE_LINK_TTL_MS = 5 * 60 * 1000;

// 128 bits of the HMAC.
const sign = (value: string) => hmacSha256(key, value, "base64url").slice(0, 22);

export function createInvoiceToken(orderId: string, expiresAt: Date) {
  const payload = `${orderId}.${Math.floor(expiresAt.getTime() / 1000).toString(36)}`;
  return `${payload}.${sign(payload)}`;
}

/** Returns the order id, or null if the token is forged or expired. */
export function readInvoiceToken(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [orderId, expiry, signature] = parts as [string, string, string];
  if (!safeEqual(sign(`${orderId}.${expiry}`), signature)) return null;

  return parseInt(expiry, 36) * 1000 < Date.now() ? null : orderId;
}
