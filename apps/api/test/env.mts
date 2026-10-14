import os from "node:os";
import path from "node:path";

// Every run gets a new database, created and dropped by test/global-setup.ts, so tests never touch
// development data. Set here once, in the main Vitest process, and inherited by the test workers.
process.env.TEST_DATABASE_NAME ??= `shop_test_${Date.now()}`;

/** A PostgreSQL connection allowed to create databases. CI sets its own. */
export const testDatabaseServerUrl = process.env.TEST_DATABASE_SERVER_URL ?? "postgresql://shop:shop_dev@localhost:5434/postgres";

const databaseUrl = new URL(testDatabaseServerUrl);
databaseUrl.pathname = `/${process.env.TEST_DATABASE_NAME}`;

export const testEnv = {
  // Ignore apps/api/.env, so a developer's settings don't change the results.
  DOTENV_CONFIG_PATH: os.devNull,
  DOTENV_CONFIG_QUIET: "true",
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  DATABASE_URL: databaseUrl.href,
  REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://localhost:6380/15",
  JWT_SECRET: "test-only-secret-at-least-32-characters-long",
  TIMEZONE: "Asia/Kolkata",
  OTP_PROVIDER: "log",
  PUSH_PROVIDER: "none",
  PAYMENT_SWEEP_INTERVAL_SECONDS: "0",
  NOTIFICATION_INTERVAL_SECONDS: "0",
  UPLOADS_DIR: path.join(os.tmpdir(), "shop-api-test-uploads"),
};
