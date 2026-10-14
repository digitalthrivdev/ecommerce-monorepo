import "dotenv/config";
import { DECIMAL_PATTERN, HEX_COLOR_PATTERN } from "@shop/validation";
import { z } from "zod";

const moneyEnv = z.string().regex(DECIMAL_PATTERN, "Must be a decimal amount, e.g. 25.00");

const hexColor = z.string().regex(HEX_COLOR_PATTERN, "Must be a hex colour, e.g. #0C831F");

/** Blank values (e.g. `RAZORPAY_KEY_ID=`) count as not set. */
const optionalSecret = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);

const demoDashboardLogin = z.object({ email: z.email(), password: z.string().min(1) });
const demoPhoneLogin = z.object({ phone: z.string().regex(/^\+[1-9]\d{6,14}$/), code: z.string().regex(/^\d{4,8}$/) });
const demoLoginsSchema = z
  .object({ admin: demoDashboardLogin, staff: demoDashboardLogin, customer: demoPhoneLogin })
  .partial()
  .strict();

/** Blank counts as not set; anything else must be valid JSON. */
function parseJsonEnv(value: unknown) {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export const demoLoginsEnv = z.preprocess(parseJsonEnv, demoLoginsSchema.optional());

function allOrNone(values: (string | undefined)[]) {
  return values.every(Boolean) || values.every((value) => !value);
}

function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return true;
  } catch {
    return false;
  }
}

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce.number().int().positive().default(4000),

  HOST: z.string().default("0.0.0.0"),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  // Which proxies may set X-Forwarded-For, so the API sees the real client IP (used for rate
  // limits): unset when clients connect directly, the number of proxy hops (e.g. 1 for one Nginx),
  // or a comma-separated list of proxy IPs/CIDRs. Never "true" while the API port is reachable
  // without the proxy, or clients could fake their IP.
  TRUST_PROXY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .string()
      .trim()
      .optional()
      .transform((value) => (value === undefined ? false : /^\d+$/.test(value) ? Number(value) : value === "true" ? true : value)),
  ),

  DATABASE_URL: z.string().url(),

  REDIS_URL: z.string().url(),

  JWT_SECRET: z.string().min(32),

  JWT_EXPIRES_IN: z.string().default("7d"),

  APP_NAME: z.string().trim().min(1).max(50).default("Shop"),

  LOGO_URL: z.url().optional(),

  PRIMARY_COLOR: hexColor.default("#0C831F"),

  SECONDARY_COLOR: hexColor.default("#F8CB46"),

  TIMEZONE: z
    .string()
    .default("Asia/Kolkata")
    .refine(isValidTimeZone, "Must be an IANA time zone, e.g. Asia/Kolkata"),

  // Initial values for the platform settings row; afterwards admins edit them in the dashboard.
  DELIVERY_FEE: moneyEnv.default("25.00"),

  FREE_DELIVERY_THRESHOLD: moneyEnv.default("199.00"),

  MIN_ORDER_VALUE: moneyEnv.default("99.00"),

  CURRENCY: z.string().regex(/^[A-Z]{3}$/, "Must be an ISO 4217 code, e.g. INR").default("INR"),

  // Public base URL of this API (https in production). Payment gateways send customers and
  // webhooks back to it. In development it defaults to the address the app called.
  PUBLIC_API_URL: z.preprocess((value) => (value === "" ? undefined : value), z.url().optional()),

  // Public website of this client (home page and policy pages, served by the admin app on
  // SITE_DOMAIN). The apps link to its policy pages; without it the links are hidden.
  PUBLIC_SITE_URL: z.preprocess((value) => (value === "" ? undefined : value), z.url().optional()),

  // Folder for uploaded images, relative to the API's working directory. Served at /uploads/; in
  // production Nginx serves it directly (see deploy/compose.yml) and the daily backup copies it.
  UPLOADS_DIR: z.string().trim().min(1).default("uploads"),

  // Encrypts the payment gateway and SMS provider keys that admins enter in the dashboard. Without
  // it, keys can only be set in this environment. Changing it makes saved keys unreadable, so they
  // must be entered again.
  SECRETS_ENCRYPTION_KEY: optionalSecret.refine((value) => value === undefined || value.length >= 32, {
    message: "Must be at least 32 characters, e.g. from `openssl rand -base64 32`",
  }),

  // Payment gateway credentials. Values set here take priority over keys saved in the dashboard.
  // Admins choose the active gateway in the dashboard.
  RAZORPAY_KEY_ID: optionalSecret,
  RAZORPAY_KEY_SECRET: optionalSecret,
  RAZORPAY_WEBHOOK_SECRET: optionalSecret,

  CASHFREE_APP_ID: optionalSecret,
  CASHFREE_SECRET_KEY: optionalSecret,
  CASHFREE_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),

  // Shipping carrier credentials. Values set here take priority over keys saved in the dashboard.
  // Admins choose the active carrier in the dashboard.
  // Shiprocket (apiv2.shiprocket.in). The API user is created under Settings → API in the
  // Shiprocket account; the webhook token is the security token set with the webhook.
  SHIPROCKET_API_EMAIL: optionalSecret,
  SHIPROCKET_API_PASSWORD: optionalSecret,
  SHIPROCKET_WEBHOOK_TOKEN: optionalSecret,
  SHIPROCKET_PICKUP_LOCATION: optionalSecret,

  // Fship (capi.fship.in). The Client Key is the security token key under Settings → API Details,
  // the address id is the pickup warehouse under Manage Warehouse. Blank uses the production API.
  FSHIP_CLIENT_KEY: optionalSecret,
  FSHIP_PICKUP_ADDRESS_ID: optionalSecret,
  FSHIP_BASE_URL: z.preprocess((value) => (value === "" ? undefined : value), z.url().optional()),

  PAYMENT_TIMEOUT_MINUTES: z.coerce.number().int().min(1).max(120).default(15),

  // 0 disables the background check for unpaid orders and pending refunds.
  PAYMENT_SWEEP_INTERVAL_SECONDS: z.coerce.number().int().min(0).max(3600).default(60),

  // OTP sends allowed per client IP (IPv6: per /64) per hour, across all phone numbers. Mobile
  // networks share one IP between many customers, so keep this generous.
  OTP_SENDS_PER_IP_PER_HOUR: z.coerce.number().int().min(1).max(10_000).default(30),

  // Login OTP delivery. Normally admins choose the SMS provider in the dashboard; setting this
  // overrides their choice (e.g. to recover access). "log" writes codes to the API log instead of
  // sending them (development only).
  OTP_PROVIDER: z.preprocess((value) => (value === "" ? undefined : value), z.enum(["log", "message-central"]).optional()),

  // Message Central VerifyNow (https://www.messagecentral.com). The key is the Base64-encoded
  // account password. Only phone numbers with this country code can sign in. Values set here take
  // priority over the dashboard.
  MESSAGE_CENTRAL_CUSTOMER_ID: optionalSecret,
  MESSAGE_CENTRAL_KEY: optionalSecret,
  MESSAGE_CENTRAL_COUNTRY_CODE: z.string().regex(/^[1-9]\d{0,3}$/, "Digits only, e.g. 91").default("91"),
  MESSAGE_CENTRAL_EMAIL: optionalSecret,

  // Sales demos only: test-account sign-in details shown on the dashboard and app sign-in screens, so
  // prospects sign in with one tap. GET /settings returns them to anyone, so never use real accounts.
  // JSON, any of: {"admin":{"email":"…","password":"…"},"staff":{…},"customer":{"phone":"+91…","code":"…"}}
  DEMO_LOGINS: demoLoginsEnv,

  // "log" writes pushes to the API log instead of sending them (development only).
  PUSH_PROVIDER: z.enum(["none", "log", "expo"]).default("log"),

  // Required by Expo only when "enhanced push security" is turned on for the project.
  EXPO_ACCESS_TOKEN: z.string().trim().min(1).optional(),

  // 0 disables the background sender for order status notifications.
  NOTIFICATION_INTERVAL_SECONDS: z.coerce.number().int().min(0).max(60).default(3),

  // Error tracking (Sentry, or a Sentry-compatible server such as GlitchTip). Blank turns it off.
  // Everything logged at error level is reported, without request bodies, headers or query strings.
  SENTRY_DSN: z.preprocess((value) => (value === "" ? undefined : value), z.url().optional()),
}).refine((value) => value.NODE_ENV !== "production" || value.PUBLIC_API_URL?.startsWith("https://"), {
  message: "PUBLIC_API_URL must be set to an https URL in production",
  path: ["PUBLIC_API_URL"],
}).refine(
  (value) => allOrNone([value.RAZORPAY_KEY_ID, value.RAZORPAY_KEY_SECRET, value.RAZORPAY_WEBHOOK_SECRET]),
  { message: "Set all of RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET, or none", path: ["RAZORPAY_KEY_ID"] },
).refine((value) => allOrNone([value.CASHFREE_APP_ID, value.CASHFREE_SECRET_KEY]), {
  message: "Set both CASHFREE_APP_ID and CASHFREE_SECRET_KEY, or neither",
  path: ["CASHFREE_APP_ID"],
}).refine(
  (value) =>
    allOrNone([
      value.SHIPROCKET_API_EMAIL,
      value.SHIPROCKET_API_PASSWORD,
      value.SHIPROCKET_WEBHOOK_TOKEN,
      value.SHIPROCKET_PICKUP_LOCATION,
    ]),
  { message: "Set all SHIPROCKET_* variables, or none", path: ["SHIPROCKET_API_EMAIL"] },
).refine((value) => allOrNone([value.FSHIP_CLIENT_KEY, value.FSHIP_PICKUP_ADDRESS_ID]), {
  message: "Set both FSHIP_CLIENT_KEY and FSHIP_PICKUP_ADDRESS_ID, or neither",
  path: ["FSHIP_CLIENT_KEY"],
},
).refine((value) => !(value.NODE_ENV === "production" && value.OTP_PROVIDER === "log"), {
  message: "OTP_PROVIDER=log is not allowed in production; configure an SMS provider",
  path: ["OTP_PROVIDER"],
}).refine((value) => allOrNone([value.MESSAGE_CENTRAL_CUSTOMER_ID, value.MESSAGE_CENTRAL_KEY]), {
  message: "Set both MESSAGE_CENTRAL_CUSTOMER_ID and MESSAGE_CENTRAL_KEY, or neither",
  path: ["MESSAGE_CENTRAL_CUSTOMER_ID"],
}).refine(
  (value) => value.OTP_PROVIDER !== "message-central" || value.MESSAGE_CENTRAL_CUSTOMER_ID,
  { message: "OTP_PROVIDER=message-central needs MESSAGE_CENTRAL_CUSTOMER_ID and MESSAGE_CENTRAL_KEY", path: ["OTP_PROVIDER"] },
).refine((value) => !(value.NODE_ENV === "production" && value.PUSH_PROVIDER === "log"), {
  message: "PUSH_PROVIDER=log is not allowed in production",
  path: ["PUSH_PROVIDER"],
});

export const env = envSchema.parse(process.env);
