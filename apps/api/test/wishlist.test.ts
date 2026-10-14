import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MAX_WISHLIST_ITEMS } from "../src/modules/wishlist/wishlist.schemas";
import { call, dashboardLogin, otpLogin, SEED, startApp } from "./helpers";

let app: FastifyInstance;
let admin: string;
let customer: string;
let categoryId: string;

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
const newCustomerPhone = () => `+9198${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;

/** A product with one variant; on sale at `price` and in stock when given, otherwise switched off. */
async function createProduct(price?: string) {
  const sku = `WISH-${unique()}`;
  const variant = price ? { sku, price } : { sku, price: "99", isActive: false };
  const created = await call(app, "POST", "/products", { token: admin, body: { name: `Wishlist Test ${sku}`, categoryId, gstRate: "5", variants: [variant] } });
  expect(created.status).toBe(201);
  const variantId: string = created.body.variants[0].id;
  if (price) {
    expect((await call(app, "PATCH", `/inventory/${variantId}`, { token: admin, body: { delta: 10, reason: "RESTOCK" } })).status).toBeLessThan(300);
  }
  return created.body.id as string;
}

const save = (productId: string, token = customer) => call(app, "PUT", `/wishlist/${productId}`, { token });
const unsave = (productId: string, token = customer) => call(app, "DELETE", `/wishlist/${productId}`, { token });
const ids = async (token = customer) => (await call(app, "GET", "/wishlist/ids", { token })).body.productIds as string[];

beforeAll(async () => {
  app = await startApp();
  admin = await dashboardLogin(app, SEED.adminEmail);
  customer = await otpLogin(app, newCustomerPhone());
  categoryId = (await app.prisma.category.findFirstOrThrow({ where: { parentId: { not: null } } })).id;
});

afterAll(async () => {
  await app.close();
});

describe("wishlist", () => {
  it("saves products once each and lists them with their price and stock", async () => {
    const stocked = await createProduct("120");
    const notSold = await createProduct();

    expect((await save(stocked)).body).toEqual({ productId: stocked, saved: true });
    expect((await save(stocked)).body).toEqual({ productId: stocked, saved: true });
    expect((await save(notSold)).status).toBe(200);
    expect(await ids()).toEqual([notSold, stocked]);

    const listed = await call(app, "GET", "/wishlist", { token: customer });
    expect(listed.status).toBe(200);
    expect(listed.body).toMatchObject({ total: 2, limit: 50, offset: 0 });
    const [first, second] = listed.body.items;
    expect(first).toMatchObject({ productId: notSold, name: expect.stringContaining("Wishlist Test"), product: null });
    expect(second.productId).toBe(stocked);
    expect(second.product).toMatchObject({ productId: stocked, variants: [expect.objectContaining({ price: "120.00", inStock: true })] });

    const paged = await call(app, "GET", "/wishlist", { token: customer, query: { limit: "1", offset: "1" } });
    expect(paged.body).toMatchObject({ total: 2, limit: 1, offset: 1, items: [{ productId: stocked, product: { productId: stocked } }] });

    // Another customer's wishlist is separate.
    const other = await otpLogin(app, SEED.customerPhone);
    expect(await ids(other)).not.toContain(stocked);

    expect((await unsave(notSold)).body).toEqual({ productId: notSold, saved: false });
    expect((await unsave(notSold)).status).toBe(200);
    expect(await ids()).toEqual([stocked]);
  });

  it("leaves out products that are hidden or deleted", async () => {
    const hidden = await createProduct("50");
    const deleted = await createProduct();
    await save(hidden);
    await save(deleted);

    expect((await call(app, "PATCH", `/products/${hidden}`, { token: admin, body: { isActive: false } })).status).toBe(200);
    expect(await ids()).not.toContain(hidden);
    expect((await save(hidden)).status).toBe(404);

    expect((await call(app, "POST", "/products/bulk-delete", { token: admin, body: { ids: [deleted] } })).status).toBe(200);
    expect(await app.prisma.wishlistItem.count({ where: { productId: deleted } })).toBe(0);
  });

  it("rejects unknown products and invalid input", async () => {
    const missing = await save("missing-product");
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe("PRODUCT_NOT_FOUND");
    expect((await save("x".repeat(65))).status).toBe(400);
    expect((await unsave("x".repeat(65))).status).toBe(400);

    expect((await call(app, "GET", "/wishlist", { token: customer, query: { limit: "0" } })).status).toBe(400);
    expect((await call(app, "GET", "/wishlist", { token: customer, query: { limit: "101" } })).status).toBe(400);
  });

  it("is only for signed-in customers", async () => {
    const product = await createProduct();
    expect((await call(app, "GET", "/wishlist")).status).toBe(401);
    expect((await call(app, "GET", "/wishlist/ids")).status).toBe(401);
    expect((await call(app, "PUT", `/wishlist/${product}`)).status).toBe(401);
    expect((await call(app, "DELETE", `/wishlist/${product}`)).status).toBe(401);
    expect((await call(app, "GET", "/wishlist", { token: admin })).status).toBe(403);
    expect((await save(product, admin)).status).toBe(403);
  });

  it(`holds at most ${MAX_WISHLIST_ITEMS} products`, async () => {
    const token = await otpLogin(app, newCustomerPhone());
    const userId = (await call(app, "GET", "/users/me", { token })).body.id as string;
    const prefix = `wishlist-cap-${unique().toLowerCase()}`;
    const filler = Array.from({ length: MAX_WISHLIST_ITEMS }, (_, index) => ({ id: `${prefix}-${index}`, name: `Cap ${index}`, slug: `${prefix}-${index}`, categoryId }));
    await app.prisma.product.createMany({ data: filler });
    await app.prisma.wishlistItem.createMany({ data: filler.map((product) => ({ userId, productId: product.id })) });

    try {
      const extra = await createProduct();
      const full = await save(extra, token);
      expect(full.status).toBe(409);
      expect(full.body.error).toBe("WISHLIST_FULL");
      expect((await save(filler[0]!.id, token)).status).toBe(200);
      expect((await ids(token)).length).toBe(MAX_WISHLIST_ITEMS);
    } finally {
      await app.prisma.product.deleteMany({ where: { id: { startsWith: prefix } } });
    }
  });

  it("is cleared when the customer deletes their account", async () => {
    const token = await otpLogin(app, newCustomerPhone());
    const userId = (await call(app, "GET", "/users/me", { token })).body.id as string;
    await save(await createProduct(), token);
    expect(await app.prisma.wishlistItem.count({ where: { userId } })).toBe(1);

    expect((await call(app, "DELETE", "/users/me", { token })).status).toBe(204);
    expect(await app.prisma.wishlistItem.count({ where: { userId } })).toBe(0);
  });
});
