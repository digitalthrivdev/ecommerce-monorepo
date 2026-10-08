import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { call, dashboardLogin, otpLogin, SEED, sendOtp, startApp } from "./helpers";

let app: FastifyInstance;

beforeAll(async () => {
  app = await startApp();
});

afterAll(async () => {
  await app.close();
});

describe("health", () => {
  it("reports the database and Redis as ok", async () => {
    const response = await call(app, "GET", "/health");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "ok", database: "ok", redis: "ok" });
  });
});

describe("dashboard sign-in", () => {
  it("signs in an admin with email and password", async () => {
    const token = await dashboardLogin(app, SEED.adminEmail);
    const me = await call(app, "GET", "/users/me", { token });
    expect(me.status).toBe(200);
    expect(me.body.role).toBe("ADMIN");
  });

  it("rejects a wrong password", async () => {
    const response = await call(app, "POST", "/auth/login", { body: { email: SEED.staffEmail, password: "wrong-password" } });
    expect(response.status).toBe(401);
    expect(response.body.error).toBe("INVALID_CREDENTIALS");
  });

  it("rejects an invalid email", async () => {
    const response = await call(app, "POST", "/auth/login", { body: { email: "not-an-email", password: "x" } });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");
  });

  it("sends no OTP to an admin's phone", async () => {
    const response = await call(app, "POST", "/auth/send-otp", { body: { phone: "+919000000001" } });
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("PASSWORD_LOGIN_REQUIRED");
  });
});

describe("phone OTP sign-in", () => {
  it("signs in a customer, and signing out revokes the token", async () => {
    const token = await otpLogin(app, SEED.customerPhone);
    const me = await call(app, "GET", "/users/me", { token });
    expect(me.status).toBe(200);
    expect(me.body.role).toBe("CUSTOMER");

    expect((await call(app, "POST", "/auth/logout", { token })).status).toBeLessThan(300);
    expect((await call(app, "GET", "/users/me", { token })).status).toBe(401);
  });

  it("rejects a wrong code", async () => {
    const otp = await sendOtp(app, SEED.customerPhone);
    const wrong = otp.slice(0, -1) + ((Number(otp.at(-1)) + 1) % 10);
    const response = await call(app, "POST", "/auth/verify-otp", { body: { phone: SEED.customerPhone, otp: wrong } });
    expect(response.status).toBe(401);
    expect(response.body.error).toBe("INVALID_OTP");
  });

  it("rejects requests without a valid token", async () => {
    expect((await call(app, "GET", "/users/me")).status).toBe(401);
    expect((await call(app, "GET", "/users/me", { token: "not-a-token" })).status).toBe(401);
  });
});
