import { z } from "zod";

const BLOCKED_SCHEMES = new Set(["http", "https", "javascript", "data", "vbscript", "file", "blob", "about"]);

/** The app's deep link that checkout returns to, e.g. grocery://payment-return or exp://… in Expo Go. */
export const startPaymentBodySchema = z.object({
  returnUrl: z
    .string()
    .trim()
    .max(500)
    .regex(/^[a-z][a-z0-9+.-]*:\/\/\S*$/i, "Must be an app link")
    .refine((url) => !BLOCKED_SCHEMES.has(url.slice(0, url.indexOf(":")).toLowerCase()), "Must be an app link"),
});

export const webhookParamsSchema = z.object({
  provider: z.string().min(1).max(32),
});

export const checkoutParamsSchema = z.object({
  token: z.string().min(1).max(100),
});

export const returnParamsSchema = checkoutParamsSchema.extend({
  provider: z.string().min(1).max(32),
});
