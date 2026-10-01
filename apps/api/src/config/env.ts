import "dotenv/config";
import { z } from "zod";

const moneyEnv = z.string().regex(/^\d{1,8}(\.\d{1,2})?$/, "Must be a decimal amount, e.g. 25.00");

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a hex colour, e.g. #0C831F");

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

  PAYMENT_PROVIDER: z.enum(["none", "mock"]).default("mock"),

  PAYMENT_TIMEOUT_MINUTES: z.coerce.number().int().min(1).max(120).default(15),

  // 0 disables the background check for unpaid orders and pending refunds.
  PAYMENT_SWEEP_INTERVAL_SECONDS: z.coerce.number().int().min(0).max(3600).default(60),
}).refine((value) => !(value.NODE_ENV === "production" && value.PAYMENT_PROVIDER === "mock"), {
  message: "PAYMENT_PROVIDER=mock is not allowed in production",
  path: ["PAYMENT_PROVIDER"],
});

export const env = envSchema.parse(process.env);
