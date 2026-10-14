import { randomUUID } from "node:crypto";

import type { FastifyInstance } from "fastify";
import sharp from "sharp";
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

  it("offers no demo logins unless DEMO_LOGINS is set", async () => {
    const response = await call(app, "GET", "/settings");
    expect(response.status).toBe(200);
    expect(response.body.demoLogins).toBeNull();
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

describe("review login", () => {
  const CODE = "246810";
  const REVIEW_PHONE = "+919000000095";

  async function clearOtpState() {
    const otpKeys = await app.redis.keys("otp:*");
    if (otpKeys.length) await app.redis.del(...otpKeys);
  }

  afterAll(async () => {
    const admin = await dashboardLogin(app, SEED.adminEmail);
    await call(app, "PUT", "/settings/review-login", { token: admin, body: { enabled: false, phone: null } });
  });

  it("is only for admins", async () => {
    const body = { enabled: true, phone: REVIEW_PHONE, code: CODE };
    expect((await call(app, "PUT", "/settings/review-login", { body })).status).toBe(401);
    const staff = await dashboardLogin(app, SEED.staffEmail);
    expect((await call(app, "PUT", "/settings/review-login", { token: staff, body })).status).toBe(403);
  });

  it("refuses a dashboard account's number, and invalid input", async () => {
    const admin = await dashboardLogin(app, SEED.adminEmail);
    const dashboard = await call(app, "PUT", "/settings/review-login", {
      token: admin,
      body: { enabled: true, phone: "+919000000001", code: CODE },
    });
    expect(dashboard.status).toBe(400);
    expect(dashboard.body.error).toBe("REVIEW_PHONE_NOT_CUSTOMER");

    const badCode = await call(app, "PUT", "/settings/review-login", {
      token: admin,
      body: { enabled: true, phone: REVIEW_PHONE, code: "12" },
    });
    expect(badCode.status).toBe(400);
    expect(badCode.body.error).toBe("VALIDATION_ERROR");
  });

  it("signs a new customer in with the fixed code and no SMS", async () => {
    const admin = await dashboardLogin(app, SEED.adminEmail);
    const saved = await call(app, "PUT", "/settings/review-login", {
      token: admin,
      body: { enabled: true, phone: REVIEW_PHONE, code: CODE },
    });
    expect(saved.status).toBe(200);
    expect(saved.body.reviewLogin).toEqual({ enabled: true, phone: REVIEW_PHONE, codeSet: true });

    await clearOtpState();
    expect((await call(app, "POST", "/auth/send-otp", { body: { phone: REVIEW_PHONE } })).status).toBe(200);
    const wrong = await call(app, "POST", "/auth/verify-otp", { body: { phone: REVIEW_PHONE, otp: "135791" } });
    expect(wrong.status).toBe(401);
    const verified = await call(app, "POST", "/auth/verify-otp", { body: { phone: REVIEW_PHONE, otp: CODE } });
    expect(verified.status).toBe(200);
    expect(verified.body.user.role).toBe("CUSTOMER");
  });

  it("does not apply to other numbers", async () => {
    await clearOtpState();
    // Another customer still gets a normal (logged) code; the fixed code does not work for it.
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
        call(app, "PUT", "/settings/review-login", { token, body: {} }),
        call(app, "DELETE", "/admin/customers/not-a-customer", { token }),
      ];
      for (const response of await Promise.all(writes)) {
        expect(response.status).toBe(403);
        expect(response.body).toMatchObject({ error: "TEST_ACCOUNT_READ_ONLY", message: "Demo account: changes are disabled" });
      }

      // Packing and manual tracking stay open (the full order flow is in orders.test.ts).
      const tracked = await call(app, "POST", "/admin/orders/not-an-order/shipment/events", { token, body: { status: "IN_TRANSIT" } });
      expect(tracked.status).toBe(404);
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
        const saved = await call(app, "PUT", "/settings/review-login", { token: admin, body: { enabled: false, phone: null } });
        expect(saved.status).toBe(200);
      } finally {
        await app.prisma.user.update({ where: { email: SEED.adminEmail }, data: { isTestAccount: true } });
      }
    });
  });

  describe("test staff and customers", () => {
    const READ_ONLY = { error: "TEST_ACCOUNT_READ_ONLY", message: "Demo account: changes are disabled" };
    let staff: string;
    let customer: string;
    let variantId: string;

    beforeAll(async () => {
      const users = await app.prisma.user.findMany({
        where: { OR: [{ email: SEED.staffEmail }, { phone: SEED.customerPhone }] },
        select: { id: true, role: true },
      });
      const userFor = (role: string) => users.find((candidate) => candidate.role === role)!;
      const tokenFor = (role: string) => {
        const user = userFor(role);
        return app.jwt.sign({ sub: user.id, role: user.role, test: true, jti: randomUUID() });
      };
      staff = tokenFor("STAFF");
      customer = tokenFor("CUSTOMER");
      variantId = (await app.prisma.productVariant.findFirstOrThrow({ where: { isActive: true, inventory: { isNot: null } }, select: { id: true } })).id;
    });

    /** A one-file multipart upload, as the dashboard sends it. */
    async function uploadImage(token: string) {
      const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#ffffff" } }).png().toBuffer();
      const boundary = "test-boundary";
      const payload = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.png"\r\nContent-Type: image/png\r\n\r\n`),
        png,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      const response = await app.inject({
        method: "POST",
        url: "/images",
        payload,
        headers: { authorization: `Bearer ${token}`, "content-type": `multipart/form-data; boundary=${boundary}` },
      });
      return { status: response.statusCode, body: response.json() };
    }

    it("blocks test staff from stock and availability changes and uploads; normal staff can", async () => {
      const normal = await dashboardLogin(app, SEED.staffEmail);
      const inventoryPath = `/inventory/${variantId}`;
      const restock = { delta: 1, reason: "RESTOCK" };
      const availability = { isActive: true };

      for (const response of [
        await call(app, "PATCH", inventoryPath, { token: staff, body: restock }),
        await call(app, "PATCH", `/variants/${variantId}`, { token: staff, body: availability }),
        await uploadImage(staff),
      ]) {
        expect(response.status).toBe(403);
        expect(response.body).toMatchObject(READ_ONLY);
      }

      expect((await call(app, "PATCH", inventoryPath, { token: normal, body: restock })).status).toBe(200);
      expect((await call(app, "PATCH", inventoryPath, { token: normal, body: { delta: -1, reason: "CORRECTION" } })).status).toBe(200);
      expect((await call(app, "PATCH", `/variants/${variantId}`, { token: normal, body: availability })).status).toBe(200);
      expect((await uploadImage(normal)).status).toBe(201);
    });

    it("keeps a test customer account from being deleted; a normal one can delete", async () => {
      const response = await call(app, "DELETE", "/users/me", { token: customer });
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject(READ_ONLY);
      expect((await call(app, "GET", "/users/me", { token: customer })).status).toBe(200);

      const token = await otpLogin(app, "+919000000097");
      expect((await call(app, "DELETE", "/users/me", { token })).status).toBe(204);
      expect((await call(app, "GET", "/users/me", { token })).status).toBe(401);
    });

    it("checks the role and the input before the test-account limits", async () => {
      // Wrong role: the usual 403 FORBIDDEN, not the demo message.
      for (const response of [
        await call(app, "DELETE", "/users/me", { token: staff }),
        await call(app, "POST", "/admin/orders/not-an-order/pack", { token: customer }),
        await call(app, "POST", "/images", { token: customer }),
      ]) {
        expect(response.status).toBe(403);
        expect(response.body.error).toBe("FORBIDDEN");
      }

      // Allowed routes still validate input.
      expect((await call(app, "POST", "/admin/orders/not-an-order/pack", { token: staff })).status).toBe(404);
      expect((await call(app, "PATCH", "/users/me", { token: customer, body: {} })).status).toBe(400);
    });
  });
});
