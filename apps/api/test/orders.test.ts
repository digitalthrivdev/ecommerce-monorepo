import { randomUUID } from "node:crypto";

import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Prisma } from "../src/generated/prisma/client";
import { includedTax } from "../src/modules/orders/tax.js";
import { call, dashboardLogin, otpLogin, SEED, startApp } from "./helpers";

let app: FastifyInstance;
let customer: string;
let storeId: string;
let addressId: string;

const address = {
  name: "Test Customer",
  phone: SEED.customerPhone,
  addressLine1: "12 Test Street",
  city: "Bengaluru",
  state: "karnataka",
  postalCode: "560034",
  latitude: 12.9355,
  longitude: 77.6249,
};

/** A seeded variant on sale in the store with its GST rate, price and stock. */
async function listing(where: Prisma.StoreProductWhereInput) {
  const storeProduct = await app.prisma.storeProduct.findFirstOrThrow({
    where: { storeId, isAvailable: true, inventory: { quantity: { gte: 10 } }, ...where },
    include: { inventory: true, variant: { include: { product: true } } },
    orderBy: { sellingPrice: "desc" },
  });
  return storeProduct;
}

const stock = async (storeProductId: string) =>
  (await app.prisma.inventory.findUniqueOrThrow({ where: { storeProductId } })).quantity;

async function fillCart(variantId: string, quantity: number) {
  await call(app, "DELETE", "/cart", { token: customer });
  const added = await call(app, "POST", "/cart/items", { token: customer, body: { storeId, variantId, quantity } });
  expect(added.status).toBeLessThan(300);
}

beforeAll(async () => {
  app = await startApp();
  customer = await otpLogin(app, SEED.customerPhone);
  storeId = (await app.prisma.store.findUniqueOrThrow({ where: { code: SEED.storeCode } })).id;
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

  it("saves the standard state name", async () => {
    const response = await call(app, "POST", "/users/me/addresses", { token: customer, body: address });
    expect(response.status).toBe(201);
    expect(response.body.state).toBe("Karnataka");
    addressId = response.body.id;
  });
});

describe("checkout", () => {
  it("creates the order, takes the stock, clears the cart and snapshots the items", async () => {
    const item = await listing({ variant: { product: { gstRate: { gt: 0 } } }, sellingPrice: { gte: 60 } });
    const before = await stock(item.id);

    await fillCart(item.variantId, 2);
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
    const amount = item.sellingPrice.mul(2);
    expect(line).toMatchObject({ sku: item.variant.sku, productName: item.variant.product.name, quantity: 2 });
    expect(line!.unitPrice.toFixed(2)).toBe(item.sellingPrice.toFixed(2));
    expect(order.taxTotal.minus(order.deliveryFeeTax).toFixed(2)).toBe(includedTax(amount, item.variant.product.gstRate).toFixed(2));
    expect(order.total.toFixed(2)).toBe(amount.plus(order.deliveryFee).toFixed(2));
    expect(order.state).toBe("Karnataka");
  });

  it("refuses an order below the minimum value and keeps stock and cart", async () => {
    const item = await listing({ sellingPrice: { lt: 50 } });
    const before = await stock(item.id);

    await fillCart(item.variantId, 1);
    const response = await call(app, "POST", "/orders", { token: customer, body: { addressId, paymentMethod: "COD" } });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("MIN_ORDER_NOT_MET");
    expect(await stock(item.id)).toBe(before);
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
  let storeProductId: string;

  beforeAll(async () => {
    const item = await listing({ sellingPrice: { gte: 100 } });
    storeProductId = item.id;
    await fillCart(item.variantId, 1);
    const response = await call(app, "POST", "/orders", { token: customer, body: { addressId, paymentMethod: "COD" } });
    expect(response.status).toBe(201);
    orderId = response.body.id;
  });

  it("shows the order only to its customer, the store and admins", async () => {
    expect((await call(app, "GET", `/orders/${orderId}`, { token: customer })).status).toBe(200);

    const other = await otpLogin(app, "+919000000099");
    const hidden = await call(app, "GET", `/orders/${orderId}`, { token: other });
    expect(hidden.status).toBe(404);
    expect(hidden.body.error).toBe("ORDER_NOT_FOUND");

    const staff = await dashboardLogin(app, SEED.staffEmail);
    expect((await call(app, "GET", `/stores/${storeId}/orders/${orderId}`, { token: staff })).status).toBe(200);
    expect((await call(app, "GET", "/admin/orders", { token: staff })).status).toBe(403);
  });

  it("lets the customer cancel before the store accepts, returning the stock", async () => {
    const before = await stock(storeProductId);
    const response = await call(app, "POST", `/orders/${orderId}/cancel`, { token: customer, body: { reason: "Ordered by mistake" } });
    expect(response.status).toBe(200);

    const order = await app.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { statusHistory: true } });
    expect(order.status).toBe("CANCELLED");
    expect(order.statusHistory.map((entry) => entry.toStatus)).toEqual(["CONFIRMED", "CANCELLED"]);
    expect(await stock(storeProductId)).toBe(before + 1);

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

  it("lets a test customer, test staff and a test rider run the whole order flow", async () => {
    const testCustomer = await testToken({ phone: SEED.customerPhone });
    const testStaff = await testToken({ email: SEED.staffEmail });
    const testRider = await testToken({ phone: SEED.riderPhone });
    const admin = await dashboardLogin(app, SEED.adminEmail);
    const staff = await dashboardLogin(app, SEED.staffEmail);
    const item = await listing({ sellingPrice: { gte: 100 } });

    await call(app, "DELETE", "/cart", { token: testCustomer });
    const added = await call(app, "POST", "/cart/items", { token: testCustomer, body: { storeId, variantId: item.variantId, quantity: 2 } });
    expect(added.status).toBe(200);
    const placed = await call(app, "POST", "/orders", { token: testCustomer, body: { addressId, paymentMethod: "COD" } });
    expect(placed.status).toBe(201);
    const orderId = placed.body.id as string;

    const orderPath = `/stores/${storeId}/orders/${orderId}`;
    const order = await app.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
    expect((await call(app, "POST", `${orderPath}/accept`, { token: testStaff })).status).toBe(200);
    expect((await call(app, "POST", `${orderPath}/start-picking`, { token: testStaff })).status).toBe(200);
    const itemPath = `${orderPath}/items/${order.items[0]!.id}/unavailable`;
    expect((await call(app, "POST", itemPath, { token: testStaff, body: { quantity: 0 } })).status).toBe(400);
    expect((await call(app, "POST", itemPath, { token: testStaff, body: { quantity: 1 } })).status).toBe(200);
    expect((await call(app, "POST", `${orderPath}/pack`, { token: testStaff })).status).toBe(200);
    expect((await call(app, "POST", `${orderPath}/ready`, { token: testStaff })).status).toBe(200);

    const partner = await app.prisma.deliveryPartner.findFirstOrThrow({ where: { user: { phone: SEED.riderPhone } } });
    expect((await call(app, "PATCH", "/delivery/me/status", { token: testRider, body: { status: "ONLINE" } })).status).toBe(200);
    const assigned = await call(app, "POST", `${orderPath}/assign`, { token: admin, body: { partnerId: partner.id } });
    expect(assigned.status).toBe(200);
    for (const step of ["accept", "pickup", "start-delivery"]) {
      expect((await call(app, "POST", `/delivery/orders/${orderId}/${step}`, { token: testRider })).status).toBe(200);
    }
    const { deliveryOtp } = (await call(app, "GET", `/orders/${orderId}`, { token: testCustomer })).body;
    const wrongOtp = String((Number(deliveryOtp) + 1) % 10_000).padStart(4, "0");
    expect((await call(app, "POST", `/delivery/orders/${orderId}/delivered`, { token: testRider, body: { otp: "12" } })).status).toBe(400);
    expect((await call(app, "POST", `/delivery/orders/${orderId}/delivered`, { token: testRider, body: { otp: wrongOtp } })).status).toBe(400);
    expect((await call(app, "POST", `/delivery/orders/${orderId}/delivered`, { token: testRider, body: { otp: deliveryOtp } })).status).toBe(200);
    expect((await app.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("DELIVERED");

    // The rider now holds the COD cash; test staff cannot record the deposit, normal staff can.
    const deposit = { amount: "1.00" };
    const blocked = await call(app, "POST", `/rider-cash/${partner.id}/deposits`, { token: testStaff, body: deposit });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toBe("TEST_ACCOUNT_READ_ONLY");
    expect((await call(app, "POST", `/rider-cash/${partner.id}/deposits`, { token: staff, body: deposit })).status).toBe(201);
  });

  it("drops the Review account label when the review number is a test account", async () => {
    const admin = await dashboardLogin(app, SEED.adminEmail);
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
