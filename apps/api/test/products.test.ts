import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { call, dashboardLogin, SEED, startApp } from "./helpers";

let app: FastifyInstance;
let admin: string;
let categoryId: string;

const product = (extra: Record<string, unknown> = {}) => ({
  name: `Test Product ${Date.now()}`,
  categoryId,
  variants: [{ sku: `TEST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }],
  ...extra,
});

beforeAll(async () => {
  app = await startApp();
  admin = await dashboardLogin(app, SEED.adminEmail);
  categoryId = (await app.prisma.category.findFirstOrThrow({ where: { parentId: { not: null } } })).id;
});

afterAll(async () => {
  await app.close();
});

describe("product GST rate", () => {
  it("is required when creating a product", async () => {
    const response = await call(app, "POST", "/products", { token: admin, body: product() });
    expect(response.status).toBe(400);
    expect(response.body.issues).toEqual([expect.objectContaining({ path: "gstRate", message: expect.stringMatching(/GST rate/) })]);
  });

  it("accepts 0 for exempt goods and cannot be cleared later", async () => {
    const created = await call(app, "POST", "/products", { token: admin, body: product({ gstRate: "0" }) });
    expect(created.status).toBe(201);
    expect(created.body.gstRate).toBe("0.00");

    const cleared = await call(app, "PATCH", `/products/${created.body.id}`, { token: admin, body: { gstRate: null } });
    expect(cleared.status).toBe(400);
    expect((await call(app, "PATCH", "/products/missing", { token: admin, body: { gstRate: "5" } })).status).toBe(404);
  });

  it("is only for admins", async () => {
    const staff = await dashboardLogin(app, SEED.staffEmail);
    expect((await call(app, "POST", "/products", { token: staff, body: product({ gstRate: "5" }) })).status).toBe(403);
    expect((await call(app, "POST", "/products", { body: product({ gstRate: "5" }) })).status).toBe(401);
  });

  it("lists products missing a GST rate or HSN code", async () => {
    const created = await call(app, "POST", "/products", { token: admin, body: product({ gstRate: "18" }) });
    const listed = await call(app, "GET", "/products", { token: admin, query: { includeInactive: "true", missingTax: "true", limit: "100" } });
    expect(listed.status).toBe(200);

    const ids = listed.body.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(created.body.id);
    const missing = await app.prisma.product.count({ where: { OR: [{ gstRate: null }, { hsnCode: null }] } });
    expect(listed.body.total).toBe(missing);
  });
});
