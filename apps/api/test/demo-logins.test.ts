import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DEMO_LOGINS = {
  admin: { email: "demo.admin@example.com", password: "demo-password" },
  customer: { phone: "+919000000002", code: "123456" },
};

let app: FastifyInstance;
let helpers: typeof import("./helpers.js");

// The environment is read once when the app is first imported, so set it before importing.
beforeAll(async () => {
  process.env.DEMO_LOGINS = JSON.stringify(DEMO_LOGINS);
  helpers = await import("./helpers.js");
  app = await helpers.startApp();
});

afterAll(async () => {
  await app.close();
  delete process.env.DEMO_LOGINS;
});

describe("demo logins", () => {
  it("are offered to the sign-in screens when set", async () => {
    const response = await helpers.call(app, "GET", "/settings");
    expect(response.status).toBe(200);
    expect(response.body.demoLogins).toEqual(DEMO_LOGINS);
  });

  it("must be valid JSON with known roles, or blank", async () => {
    const { demoLoginsEnv } = await import("../src/config/env.js");
    expect(demoLoginsEnv.parse("")).toBeUndefined();
    expect(demoLoginsEnv.parse(undefined)).toBeUndefined();
    expect(demoLoginsEnv.safeParse("{not json").success).toBe(false);
    expect(demoLoginsEnv.safeParse(JSON.stringify({ owner: DEMO_LOGINS.admin })).success).toBe(false);
    expect(demoLoginsEnv.safeParse(JSON.stringify({ admin: { email: "not-an-email", password: "x" } })).success).toBe(false);
    expect(demoLoginsEnv.safeParse(JSON.stringify({ customer: { phone: "9000000002", code: "123456" } })).success).toBe(false);
  });
});
