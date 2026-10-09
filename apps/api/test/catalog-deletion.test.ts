import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { call, dashboardLogin, otpLogin, SEED, startApp } from "./helpers";

let app: FastifyInstance;
let admin: string;
let customer: string;
let storeId: string;
let categoryId: string;
let savedSections: unknown;

/** A new product priced and stocked at the seeded store. */
async function stockedProduct() {
  const sku = `DEL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
  const created = await call(app, "POST", "/products", {
    token: admin,
    body: { name: `Delete Test ${sku}`, categoryId, gstRate: "5", variants: [{ sku }] },
  });
  expect(created.status).toBe(201);
  const id: string = created.body.id;
  const variantId: string = created.body.variants[0].id;

  const priced = await call(app, "PUT", `/products/${id}/prices`, { token: admin, body: { prices: [{ storeId, variantId, sellingPrice: "500" }] } });
  expect(priced.status).toBeLessThan(300);
  const stocked = await call(app, "PATCH", `/stores/${storeId}/inventory/${variantId}`, { token: admin, body: { delta: 10, reason: "RESTOCK" } });
  expect(stocked.status).toBeLessThan(300);
  return { id, variantId };
}

const saleHero = (productId: string) => ({
  id: "deletion-test-sale",
  type: "sale_hero",
  enabled: true,
  background: null,
  title: "Sale",
  subtitle: null,
  tagline: null,
  titleColor: "#C62828",
  animateTitle: false,
  effect: "none",
  icon: null,
  dealsLabel: null,
  productIds: [productId],
  categoryIds: [],
});

beforeAll(async () => {
  app = await startApp();
  admin = await dashboardLogin(app, SEED.adminEmail);
  customer = await otpLogin(app, SEED.customerPhone);
  storeId = (await app.prisma.store.findUniqueOrThrow({ where: { code: SEED.storeCode } })).id;
  categoryId = (await app.prisma.category.findFirstOrThrow({ where: { parentId: { not: null } } })).id;
  savedSections = (await call(app, "GET", "/settings/appearance", { token: admin })).body.homeSections;
});

afterAll(async () => {
  await call(app, "PATCH", "/settings/appearance", { token: admin, body: { homeSections: savedSections } });
  await app.close();
});

describe("bulk product deletion", () => {
  it("deletes never-ordered products, hides ordered ones and skips ones on the home screen", async () => {
    const unordered = await stockedProduct();
    const ordered = await stockedProduct();
    const featured = await stockedProduct();

    const image = await call(app, "POST", `/products/${unordered.id}/images`, { token: admin, body: { url: "https://example.com/photo.jpg" } });
    expect(image.status).toBe(201);

    const address = await call(app, "POST", "/users/me/addresses", {
      token: customer,
      body: {
        name: "Test Customer",
        phone: SEED.customerPhone,
        addressLine1: "12 Test Street",
        city: "Bengaluru",
        state: "Karnataka",
        postalCode: "560034",
        latitude: 12.9355,
        longitude: 77.6249,
      },
    });
    expect(address.status).toBe(201);
    await call(app, "DELETE", "/cart", { token: customer });
    expect((await call(app, "POST", "/cart/items", { token: customer, body: { storeId, variantId: ordered.variantId, quantity: 1 } })).status).toBeLessThan(300);
    const order = await call(app, "POST", "/orders", { token: customer, body: { addressId: address.body.id, paymentMethod: "COD" } });
    expect(order.status).toBe(201);

    expect((await call(app, "POST", "/cart/items", { token: customer, body: { storeId, variantId: unordered.variantId, quantity: 1 } })).status).toBeLessThan(300);

    const homeSections = [...(savedSections as unknown[]), saleHero(featured.id)];
    expect((await call(app, "PATCH", "/settings/appearance", { token: admin, body: { homeSections } })).status).toBe(200);

    const response = await call(app, "POST", "/products/bulk-delete", {
      token: admin,
      body: { ids: [unordered.id, ordered.id, featured.id, "missing-product", unordered.id] },
    });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      deleted: 1,
      hidden: 1,
      skipped: [{ id: featured.id, name: expect.any(String), reason: expect.stringMatching(/home screen/) }],
      notFound: 1,
    });

    const { prisma } = app;
    expect(await prisma.product.findUnique({ where: { id: unordered.id } })).toBeNull();
    expect(await prisma.productVariant.count({ where: { id: unordered.variantId } })).toBe(0);
    expect(await prisma.storeProduct.count({ where: { variantId: unordered.variantId } })).toBe(0);
    expect(await prisma.cartItem.count({ where: { variantId: unordered.variantId } })).toBe(0);
    expect(await prisma.productImage.count({ where: { productId: unordered.id } })).toBe(0);

    expect(await prisma.product.findUniqueOrThrow({ where: { id: ordered.id } })).toMatchObject({ isActive: false });
    expect(await prisma.storeProduct.count({ where: { variantId: ordered.variantId } })).toBe(1);
    const pastOrder = await call(app, "GET", `/orders/${order.body.id}`, { token: customer });
    expect(pastOrder.status).toBe(200);

    expect(await prisma.product.findUniqueOrThrow({ where: { id: featured.id } })).toMatchObject({ isActive: true });
  });

  it("checks the list of products", async () => {
    expect((await call(app, "POST", "/products/bulk-delete", { token: admin, body: { ids: [] } })).status).toBe(400);
    expect((await call(app, "POST", "/products/bulk-delete", { token: admin, body: {} })).status).toBe(400);
    const tooMany = Array.from({ length: 101 }, (_, index) => `product-${index}`);
    expect((await call(app, "POST", "/products/bulk-delete", { token: admin, body: { ids: tooMany } })).status).toBe(400);
  });

  it("is only for admins", async () => {
    const staff = await dashboardLogin(app, SEED.staffEmail);
    expect((await call(app, "POST", "/products/bulk-delete", { token: staff, body: { ids: ["any"] } })).status).toBe(403);
    expect((await call(app, "POST", "/products/bulk-delete", { body: { ids: ["any"] } })).status).toBe(401);
  });
});

describe("category deletion", () => {
  const newCategory = async (body: Record<string, unknown> = {}) => {
    const response = await call(app, "POST", "/categories", { token: admin, body: { name: `Delete Test ${Math.random().toString(36).slice(2, 8)}`, ...body } });
    expect(response.status).toBe(201);
    return response.body.id as string;
  };
  const remove = (id: string, token: string | null = admin) => call(app, "DELETE", `/categories/${id}`, { token: token ?? undefined });

  it("deletes an empty category", async () => {
    const id = await newCategory();
    const response = await remove(id);
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(id);
    expect(await app.prisma.category.findUnique({ where: { id } })).toBeNull();
    expect((await remove(id)).status).toBe(404);
  });

  it("refuses a category with sub-categories or products", async () => {
    const parent = await newCategory();
    const child = await newCategory({ parentId: parent });
    const withSub = await remove(parent);
    expect(withSub.status).toBe(409);
    expect(withSub.body.error).toBe("CATEGORY_HAS_SUBCATEGORIES");

    const created = await call(app, "POST", "/products", {
      token: admin,
      body: { name: "Category Delete Test", categoryId: child, gstRate: "5", isActive: false, variants: [{ sku: `CAT-DEL-${Date.now()}` }] },
    });
    expect(created.status).toBe(201);
    const withProduct = await remove(child);
    expect(withProduct.status).toBe(409);
    expect(withProduct.body.error).toBe("CATEGORY_HAS_PRODUCTS");

    expect((await call(app, "POST", "/products/bulk-delete", { token: admin, body: { ids: [created.body.id] } })).body.deleted).toBe(1);
    expect((await remove(child)).status).toBe(200);
    expect((await remove(parent)).status).toBe(200);
  });

  it("refuses a category used on the home screen", async () => {
    const id = await newCategory();
    const grid = { id: "deletion-test-grid", type: "category_grid", enabled: true, background: null, title: null, description: null, columns: 4, categoryIds: [id] };
    const homeSections = [...(savedSections as unknown[]), grid];
    expect((await call(app, "PATCH", "/settings/appearance", { token: admin, body: { homeSections } })).status).toBe(200);

    const response = await remove(id);
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("CATEGORY_IN_USE");

    expect((await call(app, "PATCH", "/settings/appearance", { token: admin, body: { homeSections: savedSections } })).status).toBe(200);
    expect((await remove(id)).status).toBe(200);
  });

  it("is only for admins", async () => {
    const id = await newCategory();
    const staff = await dashboardLogin(app, SEED.staffEmail);
    expect((await remove(id, staff)).status).toBe(403);
    expect((await remove(id, null)).status).toBe(401);
    expect(await app.prisma.category.findUnique({ where: { id } })).not.toBeNull();
  });
});
