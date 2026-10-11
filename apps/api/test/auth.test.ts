import { randomUUID } from "node:crypto";

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

describe("rider review login", () => {
  const CODE = "246810";

  async function clearOtpState() {
    const otpKeys = await app.redis.keys("otp:*");
    if (otpKeys.length) await app.redis.del(...otpKeys);
  }

  afterAll(async () => {
    const admin = await dashboardLogin(app, SEED.adminEmail);
    await call(app, "PUT", "/settings/rider-review-login", { token: admin, body: { enabled: false, phone: null } });
  });

  it("is only for admins", async () => {
    const body = { enabled: true, phone: SEED.riderPhone, code: CODE };
    expect((await call(app, "PUT", "/settings/rider-review-login", { body })).status).toBe(401);
    const staff = await dashboardLogin(app, SEED.staffEmail);
    expect((await call(app, "PUT", "/settings/rider-review-login", { token: staff, body })).status).toBe(403);
  });

  it("refuses a number that is not a rider, and invalid input", async () => {
    const admin = await dashboardLogin(app, SEED.adminEmail);
    const customer = await call(app, "PUT", "/settings/rider-review-login", {
      token: admin,
      body: { enabled: true, phone: SEED.customerPhone, code: CODE },
    });
    expect(customer.status).toBe(400);
    expect(customer.body.error).toBe("REVIEW_PHONE_NOT_RIDER");

    const badCode = await call(app, "PUT", "/settings/rider-review-login", {
      token: admin,
      body: { enabled: true, phone: SEED.riderPhone, code: "12" },
    });
    expect(badCode.status).toBe(400);
    expect(badCode.body.error).toBe("VALIDATION_ERROR");
  });

  it("signs the rider in with the fixed code and no SMS", async () => {
    const admin = await dashboardLogin(app, SEED.adminEmail);
    const saved = await call(app, "PUT", "/settings/rider-review-login", {
      token: admin,
      body: { enabled: true, phone: SEED.riderPhone, code: CODE },
    });
    expect(saved.status).toBe(200);
    expect(saved.body.riderReviewLogin).toEqual({ enabled: true, phone: SEED.riderPhone, codeSet: true });

    await clearOtpState();
    expect((await call(app, "POST", "/auth/send-otp", { body: { phone: SEED.riderPhone } })).status).toBe(200);
    const wrong = await call(app, "POST", "/auth/verify-otp", { body: { phone: SEED.riderPhone, otp: "135791" } });
    expect(wrong.status).toBe(401);
    const verified = await call(app, "POST", "/auth/verify-otp", { body: { phone: SEED.riderPhone, otp: CODE } });
    expect(verified.status).toBe(200);
    expect(verified.body.user.role).toBe("DELIVERY_PARTNER");
  });

  it("does not apply to the customer app's numbers", async () => {
    await clearOtpState();
    // The customer still gets a normal (logged) code; the rider's fixed code does not work for it.
    await sendOtp(app, SEED.customerPhone);
    const response = await call(app, "POST", "/auth/verify-otp", { body: { phone: SEED.customerPhone, otp: CODE } });
    expect(response.status).toBe(401);
  });
});

describe("test accounts", () => {
  it("carries the test flag in the sign-in token", async () => {
    const decode = (token: string) => app.jwt.decode<{ test?: boolean }>(token);
    expect(decode(await dashboardLogin(app, SEED.adminEmail))?.test).toBeUndefined();

    await app.prisma.user.update({ where: { email: SEED.adminEmail }, data: { isTestAccount: true } });
    try {
      expect(decode(await dashboardLogin(app, SEED.adminEmail))?.test).toBe(true);
    } finally {
      await app.prisma.user.update({ where: { email: SEED.adminEmail }, data: { isTestAccount: false } });
    }
  });

  describe("test admin", () => {
    let token: string;

    beforeAll(async () => {
      await app.prisma.user.update({ where: { email: SEED.adminEmail }, data: { isTestAccount: true } });
      token = await dashboardLogin(app, SEED.adminEmail);
    });

    afterAll(async () => {
      await app.prisma.user.update({ where: { email: SEED.adminEmail }, data: { isTestAccount: false } });
    });

    it("can read the dashboard", async () => {
      const me = await call(app, "GET", "/users/me", { token });
      expect(me.status).toBe(200);
      expect(me.body).toMatchObject({ role: "ADMIN", isTestAccount: true });
      expect((await call(app, "HEAD", "/users/me", { token })).status).toBe(200);
      expect((await call(app, "GET", "/admin/orders", { token })).status).toBe(200);
      expect((await call(app, "GET", "/settings/platform", { token })).status).toBe(200);
    });

    it("cannot change anything", async () => {
      // Invalid bodies and unknown IDs: without the check these would fail with 400 or 404, never write.
      const writes = [
        call(app, "POST", "/categories", { token, body: {} }),
        call(app, "PATCH", "/settings/platform", { token, body: {} }),
        call(app, "PUT", "/settings/rider-review-login", { token, body: {} }),
        call(app, "DELETE", "/admin/customers/not-a-customer", { token }),
      ];
      for (const response of await Promise.all(writes)) {
        expect(response.status).toBe(403);
        expect(response.body).toMatchObject({ error: "TEST_ACCOUNT_READ_ONLY", message: "Demo account: changes are disabled" });
      }
    });

    it("can sign out", async () => {
      const own = await dashboardLogin(app, SEED.adminEmail);
      expect((await call(app, "POST", "/auth/logout", { token: own })).status).toBe(204);
      expect((await call(app, "GET", "/users/me", { token: own })).status).toBe(401);
    });

    it("does not affect a normal admin", async () => {
      await app.prisma.user.update({ where: { email: SEED.adminEmail }, data: { isTestAccount: false } });
      try {
        const admin = await dashboardLogin(app, SEED.adminEmail);
        const me = await call(app, "GET", "/users/me", { token: admin });
        expect(me.body.isTestAccount).toBe(false);
        const saved = await call(app, "PUT", "/settings/rider-review-login", { token: admin, body: { enabled: false, phone: null } });
        expect(saved.status).toBe(200);
      } finally {
        await app.prisma.user.update({ where: { email: SEED.adminEmail }, data: { isTestAccount: true } });
      }
    });

    it("does not block test staff, customers or riders", async () => {
      const users = await app.prisma.user.findMany({
        where: { OR: [{ email: SEED.staffEmail }, { phone: { in: [SEED.customerPhone, SEED.riderPhone] } }] },
        select: { id: true, role: true, storeId: true },
      });
      const tokenFor = (role: string) => {
        const user = users.find((candidate) => candidate.role === role)!;
        return { user, token: app.jwt.sign({ sub: user.id, role: user.role, test: true, jti: randomUUID() }) };
      };

      const staff = tokenFor("STORE_STAFF");
      const accept = await call(app, "POST", `/stores/${staff.user.storeId}/orders/not-an-order/accept`, { token: staff.token });
      expect(accept.status).toBe(404);

      const customer = tokenFor("CUSTOMER");
      const profile = await call(app, "PATCH", "/users/me", { token: customer.token, body: {} });
      expect(profile.status).toBe(400);

      const rider = tokenFor("DELIVERY_PARTNER");
      const status = await call(app, "PATCH", "/delivery/me/status", { token: rider.token, body: { status: "NOT_A_STATUS" } });
      expect(status.status).toBe(400);
    });
  });
});
