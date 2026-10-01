import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "../../config/env.js";

const OTP_KEY = createHmac("sha256", env.JWT_SECRET).update("delivery-otp-key").digest();
const OTP_DIGITS = 4;

/**
 * The OTP is derived from the delivery id with a server key, so the customer app can always show it
 * and nothing is stored in plaintext. The database keeps only a keyed hash for verification.
 */
export function deliveryOtp(deliveryId: string) {
  const digest = createHmac("sha256", OTP_KEY).update(`otp:${deliveryId}`).digest();
  return String(digest.readUInt32BE(0) % 10 ** OTP_DIGITS).padStart(OTP_DIGITS, "0");
}

export function hashDeliveryOtp(deliveryId: string, otp: string) {
  return createHmac("sha256", OTP_KEY).update(`hash:${deliveryId}:${otp}`).digest("hex");
}

export function verifyDeliveryOtp(deliveryId: string, otp: string, storedHash: string) {
  const actual = Buffer.from(hashDeliveryOtp(deliveryId, otp));
  const expected = Buffer.from(storedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
