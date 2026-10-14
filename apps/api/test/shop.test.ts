import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { call, dashboardLogin, otpLogin, SEED, startApp } from "./helpers";

let app: FastifyInstance;
let admin: string;
let staff: string;
let customer: string;
let categoryId: string;

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();

const variantBySku = (sku: string) => app.prisma.productVariant.findUniqueOrThrow({ where: { sku }, include: { inventory: true } });

/** A new product with one variant at `price`, with `stock` units. */
async function newProduct(price: string, stock: number, extra: Record<string, unknown> = {}) {
  const sku = `SHOP-${unique()}`;
  const created = await call(app, "POST", "/products", {
    token: admin,
    body: { name: `Shop Test ${sku}`, categoryId, gstRate: "18", variants: [{ sku, price, ...extra }] },
  });
  expect(created.status).toBe(201);
  const variantId: string = created.body.variants[0].id;
  if (stock > 0) {
    expect((await call(app, "PATCH", `/inventory/${variantId}`, { token: admin, body: { quantity: stock, reason: "RESTOCK" } })).status).toBe(200);
  }
  return { productId: created.body.id as string, variantId };
}

beforeAll(async () => {
  app = await startApp();
  admin = await dashboardLogin(app, SEED.adminEmail);
  staff = await dashboardLogin(app, SEED.staffEmail);
  customer = await otpLogin(app, SEED.customerPhone);
  categoryId = (await app.prisma.category.findFirstOrThrow({ where: { parentId: { not: null } } })).id;
});

afterAll(async () => {
  await app.close();
});

describe("customer catalog", () => {
  it("lists products with prices and stock flags, without signing in", async () => {
    const listed = await call(app, "GET", "/catalog/products", { query: { search: "T-Shirt" } });
    expect(listed.status).toBe(200);
    const shirt = listed.body.items.find((item: { slug: string }) => item.slug === "classic-cotton-t-shirt");
    expect(shirt.variants).toContainEqual(expect.objectContaining({ price: "499.00", compareAtPrice: "699.00", inStock: true }));
    expect(shirt.variants).toContainEqual(expect.objectContaining({ price: "449.00", inStock: false }));
    expect(JSON.stringify(listed.body)).not.toMatch(/stockQuantity|"quantity":\d/);
  });

  it("shows a product's options, specifications and variants", async () => {
    const product = await app.prisma.product.findUniqueOrThrow({ where: { slug: "classic-cotton-t-shirt" } });
    const detail = await call(app, "GET", `/catalog/products/${product.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.options.map((option: { name: string }) => option.name)).toEqual(["Size", "Colour"]);
    expect(detail.body.specifications).toContainEqual({ name: "Material", value: "100% cotton" });
    expect(detail.body.variants[0].optionValueIds).toHaveLength(2);
  });

  it("hides hidden products and checks the id", async () => {
    const { productId } = await newProduct("150", 5);
    expect((await call(app, "GET", `/catalog/products/${productId}`)).status).toBe(200);
    await call(app, "PATCH", `/products/${productId}`, { token: admin, body: { isActive: false } });
    const hidden = await call(app, "GET", `/catalog/products/${productId}`);
    expect(hidden.status).toBe(404);
    expect(hidden.body.error).toBe("PRODUCT_NOT_FOUND");
    expect((await call(app, "GET", `/catalog/products/${"x".repeat(65)}`)).status).toBe(400);
  });

  it("lists brands with something in stock", async () => {
    const brands = await call(app, "GET", "/catalog/brands");
    expect(brands.status).toBe(200);
    expect(brands.body.items.map((brand: { slug: string }) => brand.slug)).toContain("everyday-basics");
  });
});

describe("dashboard products", () => {
  it("are for staff and admins only, with price ranges and stock", async () => {
    expect((await call(app, "GET", "/products")).status).toBe(401);
    expect((await call(app, "GET", "/products", { token: customer })).status).toBe(403);
    const listed = await call(app, "GET", "/products", { token: staff, query: { search: "Hoodie" } });
    expect(listed.status).toBe(200);
    expect(listed.body.items[0]).toMatchObject({ priceRange: { min: "1299.00", max: "1349.00" }, stockQuantity: expect.any(Number) });

    const detail = await call(app, "GET", `/products/${listed.body.items[0].id}`, { token: staff });
    expect(detail.body.variants[0]).toMatchObject({ price: "1299.00", weightGrams: 550, lengthCm: "35", stockQuantity: expect.any(Number) });
  });

  it("require a price and a compare-at price at least as high", async () => {
    const sku = `SHOP-${unique()}`;
    const body = (variant: Record<string, unknown>) => ({ name: "Price Test", categoryId, gstRate: "5", variants: [{ sku, ...variant }] });
    const missing = await call(app, "POST", "/products", { token: admin, body: body({}) });
    expect(missing.status).toBe(400);
    const lower = await call(app, "POST", "/products", { token: admin, body: body({ price: "100", compareAtPrice: "90" }) });
    expect(lower.status).toBe(400);
    expect(lower.body.issues).toEqual([expect.objectContaining({ path: "variants.0.compareAtPrice" })]);
    const heavy = await call(app, "POST", "/products", { token: admin, body: body({ price: "100", weightGrams: 0 }) });
    expect(heavy.status).toBe(400);
  });
});

describe("variant quick edit", () => {
  it("lets admins change prices and staff switch variants on or off", async () => {
    const { variantId } = await newProduct("200", 3);
    const priced = await call(app, "PATCH", `/variants/${variantId}`, { token: admin, body: { price: "180", compareAtPrice: "220" } });
    expect(priced.status).toBe(200);
    expect(priced.body).toEqual({ variantId, price: "180.00", compareAtPrice: "220.00", isActive: true, stockQuantity: 3 });

    const byStaff = await call(app, "PATCH", `/variants/${variantId}`, { token: staff, body: { price: "1" } });
    expect(byStaff.status).toBe(403);
    expect((await call(app, "PATCH", `/variants/${variantId}`, { token: staff, body: { isActive: false } })).body.isActive).toBe(false);
  });

  it("checks the compare-at price, the input, the variant and the caller", async () => {
    const { variantId } = await newProduct("200", 0);
    const lower = await call(app, "PATCH", `/variants/${variantId}`, { token: admin, body: { compareAtPrice: "150" } });
    expect(lower.status).toBe(400);
    expect(lower.body.error).toBe("INVALID_PRICE");
    expect((await call(app, "PATCH", `/variants/${variantId}`, { token: admin, body: {} })).status).toBe(400);
    expect((await call(app, "PATCH", `/variants/${variantId}`, { token: admin, body: { price: "-1" } })).status).toBe(400);
    const missing = await call(app, "PATCH", "/variants/missing-variant", { token: admin, body: { isActive: true } });
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe("VARIANT_NOT_FOUND");
    expect((await call(app, "PATCH", `/variants/${variantId}`, { token: customer, body: { isActive: true } })).status).toBe(403);
    expect((await call(app, "PATCH", `/variants/${variantId}`, { body: { isActive: true } })).status).toBe(401);
  });
});

describe("cart without a store", () => {
  it("adds in-stock variants and prices them from the variant", async () => {
    const { variantId } = await newProduct("250", 4, { compareAtPrice: "300" });
    await call(app, "DELETE", "/cart", { token: customer });
    const added = await call(app, "POST", "/cart/items", { token: customer, body: { variantId, quantity: 2 } });
    expect(added.status).toBe(200);
    expect(added.body).not.toHaveProperty("store");
    expect(added.body.items[0]).toMatchObject({ variantId, unitPrice: "250.00", compareAtPrice: "300.00", lineTotal: "500.00", issue: null });
    expect(added.body.isValid).toBe(true);
  });

  it("refuses too many, unknown, switched-off and out-of-stock variants", async () => {
    const { variantId } = await newProduct("250", 2);
    const tooMany = await call(app, "POST", "/cart/items", { token: customer, body: { variantId, quantity: 3 } });
    expect(tooMany.status).toBe(409);
    expect(tooMany.body.error).toBe("INSUFFICIENT_STOCK");

    const unknown = await call(app, "POST", "/cart/items", { token: customer, body: { variantId: "missing-variant" } });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error).toBe("PRODUCT_NOT_AVAILABLE");

    await call(app, "PATCH", `/variants/${variantId}`, { token: admin, body: { isActive: false } });
    expect((await call(app, "POST", "/cart/items", { token: customer, body: { variantId } })).status).toBe(404);

    const soldOut = await variantBySku("TSHIRT-L-WHT");
    expect((await call(app, "POST", "/cart/items", { token: customer, body: { variantId: soldOut.id } })).body.error).toBe("INSUFFICIENT_STOCK");
    expect((await call(app, "POST", "/cart/items", { token: customer, body: { variantId, quantity: 0 } })).status).toBe(400);
    expect((await call(app, "POST", "/cart/items", { body: { variantId } })).status).toBe(401);
  });

  it("refuses an order when stock ran out after adding to the cart, and keeps the stock", async () => {
    const { variantId } = await newProduct("300", 2);
    const addressId = (
      await call(app, "POST", "/users/me/addresses", {
        token: customer,
        body: { name: "Shop Customer", phone: SEED.customerPhone, addressLine1: "1 Test Road", city: "Mumbai", state: "Maharashtra", postalCode: "400001" },
      })
    ).body.id as string;
    await call(app, "DELETE", "/cart", { token: customer });
    expect((await call(app, "POST", "/cart/items", { token: customer, body: { variantId, quantity: 2 } })).status).toBe(200);
    await call(app, "PATCH", `/inventory/${variantId}`, { token: admin, body: { quantity: 1, reason: "DAMAGE" } });

    const cart = await call(app, "GET", "/cart", { token: customer });
    expect(cart.body.items[0]).toMatchObject({ issue: "INSUFFICIENT_STOCK", availableQuantity: 1 });
    const order = await call(app, "POST", "/orders", { token: customer, body: { addressId, paymentMethod: "COD" } });
    expect(order.status).toBe(409);
    expect(order.body.error).toBe("INSUFFICIENT_STOCK");
    expect(order.body.details).toEqual([expect.objectContaining({ variantId, requested: 2, available: 1 })]);
    expect((await app.prisma.inventory.findUniqueOrThrow({ where: { variantId } })).quantity).toBe(1);
  });
});

describe("inventory", () => {
  it("adjusts stock per variant with a reason and logs it", async () => {
    const { variantId } = await newProduct("120", 5);
    const lowered = await call(app, "PATCH", `/inventory/${variantId}`, { token: staff, body: { delta: -2, reason: "DAMAGE", note: "Torn" } });
    expect(lowered.status).toBe(200);
    expect(lowered.body).toMatchObject({ variantId, stockQuantity: 3, variantIsActive: true });

    const negative = await call(app, "PATCH", `/inventory/${variantId}`, { token: staff, body: { delta: -10, reason: "DAMAGE" } });
    expect(negative.status).toBe(409);
    expect((await call(app, "PATCH", `/inventory/${variantId}`, { token: staff, body: { delta: 1 } })).status).toBe(400);
    expect((await call(app, "PATCH", "/inventory/missing-variant", { token: staff, body: { delta: 1, reason: "RESTOCK" } })).status).toBe(404);
    expect((await call(app, "GET", "/inventory", { token: customer })).status).toBe(403);

    const log = await call(app, "GET", `/inventory/${variantId}/adjustments`, { token: admin });
    expect(log.body.items[0]).toMatchObject({ delta: -2, quantityAfter: 3, reason: "DAMAGE", note: "Torn" });
    const low = await call(app, "GET", "/inventory", { token: staff, query: { stock: "low", search: lowered.body.sku } });
    expect(low.body.items.map((item: { variantId: string }) => item.variantId)).toEqual([variantId]);
  });
});

describe("pickup locations", () => {
  const location = (name: string) => ({
    name,
    contactName: "Warehouse Lead",
    phone: "+919800000001",
    addressLine1: "Plot 4, MIDC",
    city: "Pune",
    state: "Maharashtra",
    postalCode: "411019",
  });

  it("keeps exactly one default", async () => {
    const listed = await call(app, "GET", "/pickup-locations", { token: admin });
    expect(listed.status).toBe(200);
    const seeded = listed.body.items.find((item: { isDefault: boolean }) => item.isDefault);
    expect(seeded).toBeTruthy();

    const created = await call(app, "POST", "/pickup-locations", { token: admin, body: location(`Pune ${unique()}`) });
    expect(created.status).toBe(201);
    expect(created.body.isDefault).toBe(false);

    const unset = await call(app, "PATCH", `/pickup-locations/${seeded.id}`, { token: admin, body: { isDefault: false } });
    expect(unset.status).toBe(409);
    expect(unset.body.error).toBe("DEFAULT_PICKUP_LOCATION_REQUIRED");

    expect((await call(app, "PATCH", `/pickup-locations/${created.body.id}`, { token: admin, body: { isDefault: true } })).body.isDefault).toBe(true);
    expect(await app.prisma.pickupLocation.count({ where: { isDefault: true } })).toBe(1);
    expect((await call(app, "DELETE", `/pickup-locations/${created.body.id}`, { token: admin })).status).toBe(409);

    expect((await call(app, "PATCH", `/pickup-locations/${seeded.id}`, { token: admin, body: { isDefault: true } })).status).toBe(200);
    expect((await call(app, "DELETE", `/pickup-locations/${created.body.id}`, { token: admin })).status).toBe(204);
    expect((await call(app, "DELETE", `/pickup-locations/${created.body.id}`, { token: admin })).status).toBe(404);
  });

  it("checks names, PIN codes and the caller", async () => {
    const name = `Duplicate ${unique()}`;
    const first = await call(app, "POST", "/pickup-locations", { token: admin, body: location(name) });
    expect(first.status).toBe(201);
    const duplicate = await call(app, "POST", "/pickup-locations", { token: admin, body: location(name) });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toBe("PICKUP_LOCATION_NAME_TAKEN");
    expect((await call(app, "POST", "/pickup-locations", { token: admin, body: { ...location("Bad PIN"), postalCode: "012345" } })).status).toBe(400);
    expect((await call(app, "GET", "/pickup-locations", { token: staff })).status).toBe(403);
    expect((await call(app, "GET", "/pickup-locations")).status).toBe(401);
    await call(app, "DELETE", `/pickup-locations/${first.body.id}`, { token: admin });
  });
});

describe("staff accounts", () => {
  it("lets admins add staff, reset their password and remove them", async () => {
    const phone = `+9197${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
    const email = `staff-${unique().toLowerCase()}@shop.test`;
    const added = await call(app, "POST", "/staff", { token: admin, body: { phone, email, password: "staff-pass-1", name: "New Staff" } });
    expect(added.status).toBe(201);
    const userId = added.body.id as string;

    const signedIn = await call(app, "POST", "/auth/login", { body: { email, password: "staff-pass-1" } });
    expect(signedIn.status).toBe(200);
    const token = signedIn.body.accessToken as string;
    expect((await call(app, "GET", "/admin/orders", { token })).status).toBe(200);

    expect((await call(app, "PUT", `/staff/${userId}/password`, { token: admin, body: { password: "staff-pass-2" } })).status).toBe(204);
    expect((await call(app, "DELETE", `/staff/${userId}`, { token: admin })).status).toBe(204);
    expect((await call(app, "GET", "/admin/orders", { token })).status).toBe(401);
    expect((await call(app, "POST", "/auth/login", { body: { email, password: "staff-pass-2" } })).status).toBe(401);
    expect((await call(app, "DELETE", `/staff/${userId}`, { token: admin })).status).toBe(404);
  });

  it("is only for admins and refuses customer numbers", async () => {
    expect((await call(app, "GET", "/staff", { token: staff })).status).toBe(403);
    const taken = await call(app, "POST", "/staff", { token: admin, body: { phone: SEED.customerPhone, email: `x-${unique().toLowerCase()}@shop.test`, password: "staff-pass-1" } });
    expect(taken.status).toBe(409);
  });
});
