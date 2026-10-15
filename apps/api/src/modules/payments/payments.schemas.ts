import { z } from "zod";

import { env } from "../../config/env.js";

const BLOCKED_SCHEMES = new Set(["http", "https", "javascript", "data", "vbscript", "file", "blob", "about"]);

/** App deep link, e.g. shop://payment-return or exp://… in Expo Go. http(s) is refused so this cannot be an open redirect. */
function isAppLink(url: string) {
  if (!/^[a-z][a-z0-9+.-]*:\/\/\S*$/i.test(url)) return false;
  return !BLOCKED_SCHEMES.has(url.slice(0, url.indexOf(":")).toLowerCase());
}

/**
 * The website's own return page. Production allows only PUBLIC_SITE_URL.
 * Development also allows localhost, where that setting is often unset.
 */
function isStorefrontReturn(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.username || parsed.password) return false;
  const local = parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
  if (env.NODE_ENV !== "production" && local) return true;
  if (!env.PUBLIC_SITE_URL) return false;
  try {
    return parsed.origin === new URL(env.PUBLIC_SITE_URL).origin;
  } catch {
    return false;
  }
}

/** Where the hosted checkout sends the customer: the app, or a page on this shop's website. */
export const startPaymentBodySchema = z.object({
  returnUrl: z
    .string()
    .trim()
    .max(500)
    .refine((url) => isAppLink(url) || isStorefrontReturn(url), "Must be an app link or a page on this shop's website"),
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
