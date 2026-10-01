import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce.number().int().positive().default(4000),

  HOST: z.string().default("0.0.0.0"),

  DATABASE_URL: z.string().url(),

  REDIS_URL: z.string().url(),

  JWT_SECRET: z.string().min(32),
});

export const env = envSchema.parse(process.env);
