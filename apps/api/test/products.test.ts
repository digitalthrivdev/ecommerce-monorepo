import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { call, dashboardLogin, SEED, startApp } from "./helpers";

let app: FastifyInstance;
let admin: string;
let categoryId: string;

const product = (extra: Record<string, unknown> = {}) => ({
  name: `Test Product ${Date.now()}`,
  categoryId,
  variants: [{ sku: `TEST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, price: "100" }],
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

describe("product preview for shared links", () => {
  const sku = () => `PREVIEW-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();

  it("shows the lowest price of a variant in stock, without signing in", async () => {
    const created = await call(app, "POST", "/products", {
      token: admin,
      body: product({
        gstRate: "5",
        description: "Shared on WhatsApp",
        options: [{ name: "Size", values: ["Small", "Large", "Family"] }],
        variants: [
          { sku: sku(), price: "40", compareAtPrice: "45", optionValues: ["Small"] },
          { sku: sku(), price: "70", optionValues: ["Large"] },
          { sku: sku(), price: "10", optionValues: ["Family"] },
        ],
      }),
    });
    expect(created.status).toBe(201);
    const id: string = created.body.id;
    const [small, large] = created.body.variants.map((variant: { id: string }) => variant.id);

    const preview = () => call(app, "GET", `/products/${id}/preview`);
    expect((await preview()).body).toEqual({
      id,
      name: created.body.name,
      description: "Shared on WhatsApp",
      brand: null,
      imageUrl: null,
      price: null,
    });

    for (const variantId of [small, large]) {
      const restock = await call(app, "PATCH", `/inventory/${variantId}`, { token: admin, body: { delta: 5, reason: "RESTOCK" } });
      expect(restock.status).toBeLessThan(300);
    }

    // The family pack is cheapest but out of stock.
    expect((await preview()).body.price).toEqual({ price: "40.00", compareAtPrice: "45.00", label: "Small", varies: true });

    await call(app, "PATCH", `/products/${id}`, { token: admin, body: { isActive: false } });
    expect((await preview()).status).toBe(404);
  });

  it("returns 404 for an unknown product and 400 for an invalid id", async () => {
    const missing = await call(app, "GET", "/products/missing-product/preview");
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe("PRODUCT_NOT_FOUND");
    expect((await call(app, "GET", `/products/${"x".repeat(65)}/preview`)).status).toBe(400);
  });
});
