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
