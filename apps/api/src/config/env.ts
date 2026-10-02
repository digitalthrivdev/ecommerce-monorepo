import "dotenv/config";
import { z } from "zod";

const moneyEnv = z.string().regex(/^\d{1,8}(\.\d{1,2})?$/, "Must be a decimal amount, e.g. 25.00");

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a hex colour, e.g. #0C831F");

/** Blank values (e.g. `RAZORPAY_KEY_ID=`) count as not set. */
const optionalSecret = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);

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

  DATABASE_URL: z.string().url(),

  REDIS_URL: z.string().url(),

  JWT_SECRET: z.string().min(32),

  JWT_EXPIRES_IN: z.string().default("7d"),

  APP_NAME: z.string().trim().min(1).max(50).default("Grocery"),

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

  DELIVERY_PARTNER_FEE: moneyEnv.default("30.00"),

  CURRENCY: z.string().regex(/^[A-Z]{3}$/, "Must be an ISO 4217 code, e.g. INR").default("INR"),

  // Public base URL of this API (https in production). Payment gateways send customers and
  // webhooks back to it. In development it defaults to the address the app called.
  PUBLIC_API_URL: z.preprocess((value) => (value === "" ? undefined : value), z.url().optional()),

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

  PAYMENT_TIMEOUT_MINUTES: z.coerce.number().int().min(1).max(120).default(15),

  // 0 disables the background check for unpaid orders and pending refunds.
  PAYMENT_SWEEP_INTERVAL_SECONDS: z.coerce.number().int().min(0).max(3600).default(60),

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

  // "log" writes pushes to the API log instead of sending them (development only).
  PUSH_PROVIDER: z.enum(["none", "log", "expo"]).default("log"),

  // Required by Expo only when "enhanced push security" is turned on for the project.
  EXPO_ACCESS_TOKEN: z.string().trim().min(1).optional(),

  // 0 disables the background sender for order status notifications.
  NOTIFICATION_INTERVAL_SECONDS: z.coerce.number().int().min(0).max(60).default(3),
}).refine((value) => value.NODE_ENV !== "production" || value.PUBLIC_API_URL?.startsWith("https://"), {
  message: "PUBLIC_API_URL must be set to an https URL in production",
  path: ["PUBLIC_API_URL"],
}).refine(
  (value) => allOrNone([value.RAZORPAY_KEY_ID, value.RAZORPAY_KEY_SECRET, value.RAZORPAY_WEBHOOK_SECRET]),
  { message: "Set all of RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET, or none", path: ["RAZORPAY_KEY_ID"] },
).refine((value) => allOrNone([value.CASHFREE_APP_ID, value.CASHFREE_SECRET_KEY]), {
  message: "Set both CASHFREE_APP_ID and CASHFREE_SECRET_KEY, or neither",
  path: ["CASHFREE_APP_ID"],
}).refine((value) => !(value.NODE_ENV === "production" && value.OTP_PROVIDER === "log"), {
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
