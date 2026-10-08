import type { FastifyInstance, InjectOptions } from "fastify";
import { expect, vi } from "vitest";

import { buildApp } from "../src/app.js";

/** Accounts created by the development seed (src/infrastructure/database/seed.ts). */
export const SEED = {
  password: "grocery-dev",
  adminEmail: "admin@grocery.test",
  staffEmail: "staff@grocery.test",
  customerPhone: "+919000000002",
  riderPhone: "+919000000004",
  storeCode: "BLR-KRM-01",
};

export async function startApp() {
  const app = await buildApp();
  await app.ready();
  return app;
}

type CallOptions = { token?: string; body?: unknown; query?: Record<string, string> };

export async function call(app: FastifyInstance, method: InjectOptions["method"], url: string, options: CallOptions = {}) {
  const response = await app.inject({
    method,
    url,
    query: options.query,
    payload: options.body as InjectOptions["payload"],
    headers: options.token ? { authorization: `Bearer ${options.token}` } : {},
  });
  let body: any;
  try {
    body = response.json();
  } catch {
    body = response.body;
  }
  return { status: response.statusCode, body, headers: response.headers };
}

export async function dashboardLogin(app: FastifyInstance, email: string) {
  const response = await call(app, "POST", "/auth/login", { body: { email, password: SEED.password } });
  expect(response.status).toBe(200);
  return response.body.accessToken as string;
}

/** Sends a sign-in OTP and returns the code the "log" OTP provider writes, clearing earlier rate limits. */
export async function sendOtp(app: FastifyInstance, phone: string) {
  const otpKeys = await app.redis.keys("otp:*");
  if (otpKeys.length) await app.redis.del(...otpKeys);

  const logged = vi.spyOn(app.log, "info");
  const sent = await call(app, "POST", "/auth/send-otp", { body: { phone } });
  const entry = logged.mock.calls.find(([fields]) => (fields as { phone?: string })?.phone === phone);
  logged.mockRestore();
  expect(sent.status).toBe(200);

  const otp = (entry?.[0] as { otp?: string } | undefined)?.otp;
  expect(otp).toMatch(/^\d+$/);
  return otp!;
}

export async function otpLogin(app: FastifyInstance, phone: string) {
  const otp = await sendOtp(app, phone);
  const verified = await call(app, "POST", "/auth/verify-otp", { body: { phone, otp } });
  expect(verified.status).toBe(200);
  return verified.body.accessToken as string;
}
