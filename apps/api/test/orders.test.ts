import { randomUUID } from "node:crypto";

import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Prisma } from "../src/generated/prisma/client";
import { includedTax } from "../src/modules/orders/tax.js";
import { call, dashboardLogin, otpLogin, SEED, startApp } from "./helpers";

let app: FastifyInstance;
let customer: string;
let admin: string;
let addressId: string;

const address = {
  name: "Test Customer",
  phone: SEED.customerPhone,
  addressLine1: "12 Test Street",
  city: "Bengaluru",
  state: "karnataka",
  postalCode: "560034",
};

/** A seeded variant on sale, with its product, price and at least 10 in stock. */
async function listing(where: Prisma.ProductVariantWhereInput = {}) {
  return app.prisma.productVariant.findFirstOrThrow({
    where: { isActive: true, product: { isActive: true }, inventory: { is: { quantity: { gte: 10 } } }, ...where },
    include: { inventory: true, product: true },
    orderBy: { price: "desc" },
  });
}

const stock = async (variantId: string) => (await app.prisma.inventory.findUniqueOrThrow({ where: { variantId } })).quantity;

async function fillCart(variantId: string, quantity: number) {
  await call(app, "DELETE", "/cart", { token: customer });
  const added = await call(app, "POST", "/cart/items", { token: customer, body: { variantId, quantity } });
  expect(added.status).toBeLessThan(300);
}

beforeAll(async () => {
  app = await startApp();
  customer = await otpLogin(app, SEED.customerPhone);
  admin = await dashboardLogin(app, SEED.adminEmail);
});

afterAll(async () => {
  await app.close();
});

describe("addresses", () => {
  it("rejects a state that is not in India", async () => {
    const response = await call(app, "POST", "/users/me/addresses", { token: customer, body: { ...address, state: "Atlantis" } });
    expect(response.status).toBe(400);
    expect(response.body.issues).toEqual([expect.objectContaining({ path: "state" })]);
  });

  it("saves an address without a map pin", async () => {
    const { latitude: _latitude, longitude: _longitude, ...unpinned } = { ...address, latitude: null, longitude: null };
    const response = await call(app, "POST", "/users/me/addresses", { token: customer, body: unpinned });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ latitude: null, longitude: null });
  });

  it("saves the standard state name", async () => {
    const response = await call(app, "POST", "/users/me/addresses", { token: customer, body: address });
    expect(response.status).toBe(201);
    expect(response.body.state).toBe("Karnataka");
    addressId = response.body.id;
  });
});

describe("checkout", () => {
  it("creates the order, takes the stock, clears the cart and snapshots the items", async () => {
    const item = await listing({ product: { isActive: true, gstRate: { gt: 0 } }, price: { gte: 60 } });
    const before = await stock(item.id);

    await fillCart(item.id, 2);
    const response = await call(app, "POST", "/orders", { token: customer, body: { addressId, paymentMethod: "COD" } });
    expect(response.status).toBe(201);
    const order = await app.prisma.order.findUniqueOrThrow({
      where: { id: response.body.id },
      include: { items: true, statusHistory: true, payment: true },
    });

    expect(order.status).toBe("CONFIRMED");
    expect(await stock(item.id)).toBe(before - 2);
    expect((await call(app, "GET", "/cart", { token: customer })).body.items ?? []).toHaveLength(0);
    expect(order.statusHistory.map((entry) => entry.toStatus)).toEqual(["CONFIRMED"]);
    expect(order.payment?.status).toBe("PENDING");
    expect(order.payment?.amount.toFixed(2)).toBe(order.total.toFixed(2));

    const [line] = order.items;
    const amount = item.price.mul(2);
    expect(line).toMatchObject({ sku: item.sku, productName: item.product.name, quantity: 2 });
    expect(line!.unitPrice.toFixed(2)).toBe(item.price.toFixed(2));
    expect(line!.compareAtPrice?.toFixed(2) ?? null).toBe(item.compareAtPrice?.toFixed(2) ?? null);
    expect(order.taxTotal.minus(order.deliveryFeeTax).toFixed(2)).toBe(includedTax(amount, item.product.gstRate).toFixed(2));
    expect(order.total.toFixed(2)).toBe(amount.plus(order.deliveryFee).toFixed(2));
    expect(order.state).toBe("Karnataka");
  });

  it("refuses an order below the minimum value and keeps stock and cart", async () => {
    const sku = `CHEAP-${Date.now()}`;
    const categoryId = (await app.prisma.category.findFirstOrThrow({ where: { parentId: { not: null } } })).id;
    const created = await call(app, "POST", "/products", {
      token: admin,
      body: { name: `Cheap ${sku}`, categoryId, gstRate: "5", variants: [{ sku, price: "20" }] },
    });
    expect(created.status).toBe(201);
    const variantId: string = created.body.variants[0].id;
    expect((await call(app, "PATCH", `/inventory/${variantId}`, { token: admin, body: { quantity: 10, reason: "RESTOCK" } })).status).toBe(200);
    const before = await stock(variantId);

    await fillCart(variantId, 1);
    const response = await call(app, "POST", "/orders", { token: customer, body: { addressId, paymentMethod: "COD" } });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("MIN_ORDER_NOT_MET");
    expect(await stock(variantId)).toBe(before);
    expect((await call(app, "GET", "/cart", { token: customer })).body.items).toHaveLength(1);
  });

  it("refuses an unknown address, bad input and missing sign-in", async () => {
    const unknown = await call(app, "POST", "/orders", { token: customer, body: { addressId: "missing", paymentMethod: "COD" } });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error).toBe("ADDRESS_NOT_FOUND");

    const invalid = await call(app, "POST", "/orders", { token: customer, body: { addressId, paymentMethod: "BITCOIN" } });
    expect(invalid.status).toBe(400);

    expect((await call(app, "POST", "/orders", { body: { addressId, paymentMethod: "COD" } })).status).toBe(401);
  });
});

describe("after checkout", () => {
  let orderId: string;
  let variantId: string;

  beforeAll(async () => {
    const item = await listing({ price: { gte: 100 } });
    variantId = item.id;
    await fillCart(item.id, 1);
    const response = await call(app, "POST", "/orders", { token: customer, body: { addressId, paymentMethod: "COD" } });
    expect(response.status).toBe(201);
    orderId = response.body.id;
  });

  it("shows the order only to its customer, staff and admins", async () => {
    expect((await call(app, "GET", `/orders/${orderId}`, { token: customer })).status).toBe(200);

    const other = await otpLogin(app, "+919000000099");
    const hidden = await call(app, "GET", `/orders/${orderId}`, { token: other });
    expect(hidden.status).toBe(404);
    expect(hidden.body.error).toBe("ORDER_NOT_FOUND");

    const staff = await dashboardLogin(app, SEED.staffEmail);
    expect((await call(app, "GET", `/admin/orders/${orderId}`, { token: staff })).status).toBe(200);
    expect((await call(app, "GET", "/admin/orders", { token: staff })).status).toBe(200);
    expect((await call(app, "GET", "/admin/orders", { token: customer })).status).toBe(403);
    expect((await call(app, "GET", "/admin/orders/attention", { token: staff })).status).toBe(403);
  });

  it("lets the customer cancel before it is accepted, returning the stock", async () => {
    const before = await stock(variantId);
    const response = await call(app, "POST", `/orders/${orderId}/cancel`, { token: customer, body: { reason: "Ordered by mistake" } });
    expect(response.status).toBe(200);

    const order = await app.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { statusHistory: true } });
    expect(order.status).toBe("CANCELLED");
    expect(order.statusHistory.map((entry) => entry.toStatus)).toEqual(["CONFIRMED", "CANCELLED"]);
    expect(await stock(variantId)).toBe(before + 1);

    const again = await call(app, "POST", `/orders/${orderId}/cancel`, { token: customer, body: {} });
    expect(again.status).toBeGreaterThanOrEqual(400);
  });
});

describe("test accounts", () => {
  /** A sign-in token as the API issues it to a test account. */
  async function testToken(where: Prisma.UserWhereUniqueInput) {
    const user = await app.prisma.user.findUniqueOrThrow({ where, select: { id: true, role: true } });
    return app.jwt.sign({ sub: user.id, role: user.role, test: true, jti: randomUUID() });
  }

  it("lets a test customer, test staff and the test admin run the whole order flow", async () => {
    const testCustomer = await testToken({ phone: SEED.customerPhone });
    const testStaff = await testToken({ email: SEED.staffEmail });
    const testAdmin = await testToken({ email: SEED.adminEmail });
    const item = await listing({ price: { gte: 100 } });

    await call(app, "DELETE", "/cart", { token: testCustomer });
    const added = await call(app, "POST", "/cart/items", { token: testCustomer, body: { variantId: item.id, quantity: 2 } });
    expect(added.status).toBe(200);
    const placed = await call(app, "POST", "/orders", { token: testCustomer, body: { addressId, paymentMethod: "COD" } });
    expect(placed.status).toBe(201);
    const orderId = placed.body.id as string;

    const orderPath = `/admin/orders/${orderId}`;
    const order = await app.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
    expect((await call(app, "POST", `${orderPath}/accept`, { token: testStaff })).status).toBe(200);
    expect((await call(app, "POST", `${orderPath}/start-picking`, { token: testStaff })).status).toBe(200);
    const itemPath = `${orderPath}/items/${order.items[0]!.id}/unavailable`;
    expect((await call(app, "POST", itemPath, { token: testStaff, body: { quantity: 0 } })).status).toBe(400);
    expect((await call(app, "POST", itemPath, { token: testStaff, body: { quantity: 1 } })).status).toBe(200);
    expect((await call(app, "POST", `${orderPath}/pack`, { token: testStaff })).status).toBe(200);
    expect((await call(app, "POST", `${orderPath}/ready`, { token: testStaff })).status).toBe(200);

    // The delivery steps are admin-only; the read-only test admin may still run them.
    const staffTry = await call(app, "POST", `${orderPath}/out-for-delivery`, { token: testStaff });
    expect(staffTry.status).toBe(403);
    expect(staffTry.body.error).toBe("FORBIDDEN");
    expect((await call(app, "POST", `${orderPath}/out-for-delivery`, { token: testAdmin, body: { note: "" } })).status).toBe(400);
    expect((await call(app, "POST", `/admin/orders/not-an-order/out-for-delivery`, { token: testAdmin })).status).toBe(404);
    expect((await call(app, "POST", `${orderPath}/out-for-delivery`, { token: testAdmin })).status).toBe(200);
    expect((await call(app, "POST", `${orderPath}/out-for-delivery`, { token: testAdmin })).status).toBe(409);
    const delivered = await call(app, "POST", `${orderPath}/mark-delivered`, { token: testAdmin, body: { note: "Handed over" } });
    expect(delivered.status).toBe(200);
    expect(delivered.body.deliveredAt).toBeTruthy();

    const final = await app.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { payment: true, statusHistory: { orderBy: { createdAt: "asc" } } } });
    expect(final.status).toBe("DELIVERED");
    expect(final.invoiceNumber).toMatch(/^INV\//);
    // The seller address comes from the default pickup location, in the customer's state.
    expect(final).toMatchObject({ sellerAddress: expect.stringContaining("Karnataka 560034"), interStateSupply: false });
    expect(final.payment).toMatchObject({ status: "PAID", provider: "cash" });
    expect(final.statusHistory.map((entry) => entry.toStatus).slice(-2)).toEqual(["OUT_FOR_DELIVERY", "DELIVERED"]);
    const view = await call(app, "GET", `/orders/${orderId}`, { token: testCustomer });
    expect(view.body).toMatchObject({ status: "DELIVERED", canRate: true, canReportIssue: true });
  });

  it("lets only an admin cancel an order out for delivery, returning the stock", async () => {
    const staff = await dashboardLogin(app, SEED.staffEmail);
    const item = await listing({ price: { gte: 100 } });
    await fillCart(item.id, 1);
    const placed = await call(app, "POST", "/orders", { token: customer, body: { addressId, paymentMethod: "COD" } });
    expect(placed.status).toBe(201);
    const orderPath = `/admin/orders/${placed.body.id}`;
    for (const step of ["accept", "start-picking", "pack", "ready"]) {
      expect((await call(app, "POST", `${orderPath}/${step}`, { token: staff })).status).toBe(200);
    }
    expect((await call(app, "POST", `${orderPath}/out-for-delivery`, { token: admin })).status).toBe(200);
    const before = await stock(item.id);

    const byStaff = await call(app, "POST", `${orderPath}/cancel`, { token: staff, body: { reason: "Customer refused" } });
    expect(byStaff.status).toBe(409);
    expect(byStaff.body.error).toBe("ORDER_NOT_CANCELLABLE");
    expect((await call(app, "POST", `${orderPath}/cancel`, { token: admin, body: {} })).status).toBe(400);
    const cancelled = await call(app, "POST", `${orderPath}/cancel`, { token: admin, body: { reason: "Customer refused" } });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe("CANCELLED");
    expect(await stock(item.id)).toBe(before + 1);
    expect((await call(app, "POST", `${orderPath}/mark-delivered`, { token: admin })).status).toBe(409);
  });

  it("lets the test admin run the fulfilment steps, but not cancel", async () => {
    const testAdmin = await testToken({ email: SEED.adminEmail });
    const item = await listing({ price: { gte: 100 } });
    await fillCart(item.id, 2);
    const placed = await call(app, "POST", "/orders", { token: customer, body: { addressId, paymentMethod: "COD" } });
    expect(placed.status).toBe(201);
    const orderPath = `/admin/orders/${placed.body.id}`;
    const order = await app.prisma.order.findUniqueOrThrow({ where: { id: placed.body.id }, include: { items: true } });

    expect((await call(app, "POST", `${orderPath}/pack`, { token: testAdmin })).status).toBe(409);
    expect((await call(app, "POST", `/admin/orders/not-an-order/accept`, { token: testAdmin })).status).toBe(404);
    expect((await call(app, "POST", `${orderPath}/accept`, { token: testAdmin })).status).toBe(200);
    expect((await call(app, "POST", `${orderPath}/start-picking`, { token: testAdmin })).status).toBe(200);
    const itemPath = `${orderPath}/items/${order.items[0]!.id}/unavailable`;
    expect((await call(app, "POST", itemPath, { token: testAdmin, body: { quantity: 1 } })).status).toBe(200);
    expect((await call(app, "POST", `${orderPath}/pack`, { token: testAdmin })).status).toBe(200);
    expect((await call(app, "POST", `${orderPath}/ready`, { token: testAdmin })).status).toBe(200);

    const cancel = await call(app, "POST", `${orderPath}/cancel`, { token: testAdmin, body: { reason: "Demo" } });
    expect(cancel.status).toBe(403);
    expect(cancel.body.error).toBe("TEST_ACCOUNT_READ_ONLY");
    const history = await app.prisma.orderStatusHistory.findMany({ where: { orderId: order.id }, orderBy: { createdAt: "asc" } });
    expect(history.map((entry) => entry.toStatus)).toEqual(["CONFIRMED", "STORE_ACCEPTED", "PICKING", "PICKING", "PACKED", "READY_FOR_PICKUP"]);
  });

  it("drops the Review account label when the review number is a test account", async () => {
    const labels = async () => {
      const list = await call(app, "GET", "/admin/orders", { token: admin, query: { limit: "50" } });
      const mine = await app.prisma.order.findMany({ where: { user: { phone: SEED.customerPhone } }, select: { id: true } });
      const ids = new Set(mine.map((order) => order.id));
      return new Set((list.body.items as { id: string; reviewAccount: boolean }[]).filter((order) => ids.has(order.id)).map((order) => order.reviewAccount));
    };

    const saved = await call(app, "PUT", "/settings/review-login", { token: admin, body: { enabled: true, phone: SEED.customerPhone, code: "246810" } });
    expect(saved.status).toBe(200);
    try {
      expect(await labels()).toEqual(new Set([true]));
      await app.prisma.user.update({ where: { phone: SEED.customerPhone }, data: { isTestAccount: true } });
      expect(await labels()).toEqual(new Set([false]));
    } finally {
      await app.prisma.user.update({ where: { phone: SEED.customerPhone }, data: { isTestAccount: false } });
      await call(app, "PUT", "/settings/review-login", { token: admin, body: { enabled: false, phone: null } });
    }
  });
});
