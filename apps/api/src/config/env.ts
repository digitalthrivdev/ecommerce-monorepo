import "dotenv/config";
import { z } from "zod";

const moneyEnv = z.string().regex(/^\d{1,8}(\.\d{1,2})?$/, "Must be a decimal amount, e.g. 25.00");

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

  DELIVERY_FEE: moneyEnv.default("25.00"),

  FREE_DELIVERY_THRESHOLD: moneyEnv.default("199.00"),

  MIN_ORDER_VALUE: moneyEnv.default("99.00"),
});

export const env = envSchema.parse(process.env);
