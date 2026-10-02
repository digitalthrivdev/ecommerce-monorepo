import { env } from "../../config/env.js";
import { hmacSha256, safeEqual } from "./gateway-helpers.js";

/**
 * Lets the customer's browser open a payment's checkout and return pages without the app's access
 * token. Signed with a key derived from JWT_SECRET; valid until the payment window closes. Kept
 * short because Fastify caps path parameters at 100 characters.
 */
const key = hmacSha256(env.JWT_SECRET, "payment-checkout-token", "hex");

// 128 bits of the HMAC.
const sign = (value: string) => hmacSha256(key, value, "base64url").slice(0, 22);

export function createCheckoutToken(paymentId: string, expiresAt: Date) {
  const payload = `${paymentId}.${Math.floor(expiresAt.getTime() / 1000).toString(36)}`;
  return `${payload}.${sign(payload)}`;
}

/** Returns the payment id, or null if the token is forged or expired. */
export function readCheckoutToken(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [paymentId, expiry, signature] = parts as [string, string, string];
  if (!safeEqual(sign(`${paymentId}.${expiry}`), signature)) return null;

  return parseInt(expiry, 36) * 1000 < Date.now() ? null : paymentId;
}
