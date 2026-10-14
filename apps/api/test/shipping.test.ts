import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MOCK_SHIPPING_SIGNATURE_HEADER, signMockShippingWebhook } from "../src/modules/shipping/mock-carrier.js";
import { orderStatusAfter } from "../src/modules/shipping/shipment-status.js";
import { call, dashboardLogin, otpLogin, SEED, startApp } from "./helpers";

let app: FastifyInstance;
let admin: string;
let staff: string;
let customer: string;
let addressId: string;

const parcel = { weightGrams: 600, lengthCm: "25", breadthCm: "18", heightCm: "8" };

function webhook(body: Record<string, unknown>, signature?: string) {
  const payload = JSON.stringify(body);
  return app.inject({
    method: "POST",
    url: "/shipping/webhooks/mock",
    headers: { "content-type": "application/json", [MOCK_SHIPPING_SIGNATURE_HEADER]: signature ?? signMockShippingWebhook(payload) },
    payload,
  });
}

/** A packed COD order, ready to ship. */
async function packedOrder() {
  const variant = await app.prisma.productVariant.findFirstOrThrow({
    where: { isActive: true, product: { isActive: true }, inventory: { is: { quantity: { gte: 10 } } }, price: { gte: 100 } },
  });
  await call(app, "DELETE", "/cart", { token: customer });
  expect((await call(app, "POST", "/cart/items", { token: customer, body: { variantId: variant.id, quantity: 1 } })).status).toBe(200);
  const placed = await call(app, "POST", "/orders", { token: customer, body: { addressId, paymentMethod: "COD" } });
  expect(placed.status).toBe(201);
  const orderPath = `/admin/orders/${placed.body.id}`;
  expect((await call(app, "POST", `${orderPath}/pack`, { token: staff })).status).toBe(200);
  return { orderId: placed.body.id as string, orderPath };
}

const history = async (orderId: string) =>
  (await app.prisma.orderStatusHistory.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } })).map((entry) => entry.toStatus);

beforeAll(async () => {
  app = await startApp();
  admin = await dashboardLogin(app, SEED.adminEmail);
  staff = await dashboardLogin(app, SEED.staffEmail);
  customer = await otpLogin(app, SEED.customerPhone);
  addressId = (
    await call(app, "POST", "/users/me/addresses", {
      token: customer,
      body: { name: "Ship Test", phone: SEED.customerPhone, addressLine1: "4 Carrier Lane", city: "Pune", state: "Maharashtra", postalCode: "411001" },
    })
  ).body.id;
  const selected = await call(app, "PATCH", "/settings/platform", { token: admin, body: { shippingProvider: "mock" } });
  expect(selected.status).toBe(200);
  expect(selected.body.shippingProvider).toBe("mock");
});

afterAll(async () => {
  await call(app, "PATCH", "/settings/platform", { token: admin, body: { shippingProvider: "manual" } });
  await app.close();
});

describe("order status from shipment status", () => {
  it("only moves forward, and RTO only once the parcel left", () => {
    expect(orderStatusAfter("PACKED", "PICKUP_SCHEDULED")).toBeNull();
    expect(orderStatusAfter("PACKED", "PICKED_UP")).toBe("SHIPPED");
    expect(orderStatusAfter("PACKED", "DELIVERED")).toBe("DELIVERED");
    expect(orderStatusAfter("OUT_FOR_DELIVERY", "IN_TRANSIT")).toBeNull();
    expect(orderStatusAfter("OUT_FOR_DELIVERY", "NDR")).toBeNull();
    expect(orderStatusAfter("IN_TRANSIT", "RTO_IN_TRANSIT")).toBe("RTO");
    expect(orderStatusAfter("PACKED", "RTO_IN_TRANSIT")).toBeNull();
    expect(orderStatusAfter("DELIVERED", "RTO_DELIVERED")).toBeNull();
    expect(orderStatusAfter("SHIPPED", "CANCELLED")).toBe("PACKED");
    expect(orderStatusAfter("IN_TRANSIT", "CANCELLED")).toBeNull();
  });
});

describe("carrier settings", () => {
  it("lists carriers without secrets and refuses unknown ones", async () => {
    const settings = await call(app, "GET", "/settings/platform", { token: admin });
    expect(settings.body.shippingCarriers.map((carrier: { name: string }) => carrier.name)).toEqual(["manual", "shiprocket", "fship", "mock"]);
    expect(settings.body.shippingCarriers[0]).toMatchObject({ configured: true, needsCredentials: false, editable: false });

    const unknown = await call(app, "PATCH", "/settings/platform", { token: admin, body: { shippingProvider: "nope" } });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error).toBe("SHIPPING_CARRIER_NOT_CONFIGURED");
    expect((await call(app, "PUT", "/settings/shipping-carriers/manual", { token: admin, body: { credentials: {} } })).status).toBe(404);
    expect((await call(app, "PATCH", "/settings/platform", { token: staff, body: { shippingProvider: "manual" } })).status).toBe(403);
  });
});

describe("shipping with a carrier", () => {
  it("books the shipment, then follows the carrier's webhooks", async () => {
    const { orderId, orderPath } = await packedOrder();

    expect((await call(app, "POST", `${orderPath}/shipment`)).status).toBe(401);
    expect((await call(app, "POST", `${orderPath}/shipment`, { token: customer, body: parcel })).status).toBe(403);
    expect((await call(app, "POST", `${orderPath}/shipment`, { token: staff, body: { ...parcel, weightGrams: 0 } })).status).toBe(400);
    expect((await call(app, "POST", `${orderPath}/shipment`, { token: staff, body: { ...parcel, awb: "AWB12345" } })).status).toBe(400);
    expect((await call(app, "POST", "/admin/orders/not-an-order/shipment", { token: staff, body: parcel })).status).toBe(404);

    const booked = await call(app, "POST", `${orderPath}/shipment`, { token: staff, body: parcel });
    expect(booked.status).toBe(201);
    expect(booked.body.status).toBe("PACKED");
    expect(booked.body.shipment).toMatchObject({
      provider: "mock",
      status: "PICKUP_SCHEDULED",
      courierName: "Test Courier",
      awb: expect.stringMatching(/^MOCK\d{13}$/),
      labelUrl: expect.stringMatching(/^data:text\/plain;base64,/),
      parcel: { weightGrams: 600, lengthCm: "25", breadthCm: "18", heightCm: "8" },
    });
    // Staff can cancel the booking; recording tracking by hand is for admins.
    expect(booked.body.allowedActions).toContain("cancel-shipment");
    expect(booked.body.allowedActions).not.toContain("add-tracking");
    expect(booked.body.allowedActions).not.toContain("cancel");
    expect((await call(app, "GET", orderPath, { token: admin })).body.allowedActions).toContain("add-tracking");
    const awb = booked.body.shipment.awb as string;

    // Signature, carrier and shipment checks. Unknown shipments are acknowledged so the carrier stops retrying.
    expect((await webhook({ awb, status: "PICKED_UP" }, "bad-signature")).statusCode).toBe(401);
    const unknownCarrier = await app.inject({ method: "POST", url: "/shipping/webhooks/nope", headers: { "content-type": "application/json" }, payload: "{}" });
    expect(unknownCarrier.statusCode).toBe(404);
    expect((await webhook({ awb: "MOCK0000000000000", status: "PICKED_UP" })).statusCode).toBe(200);
    expect((await webhook({ awb, status: "SOMETHING_NEW" })).statusCode).toBe(200);

    const pickedUpAt = new Date(Date.now() + 1000).toISOString();
    expect((await webhook({ awb, status: "PICKED_UP", eventId: "e1", occurredAt: pickedUpAt, location: "Pune" })).statusCode).toBe(200);
    // The same update again changes nothing.
    expect((await webhook({ awb, status: "PICKED_UP", eventId: "e1", occurredAt: pickedUpAt, location: "Pune" })).statusCode).toBe(200);
    const inTransitAt = new Date(Date.now() + 3000).toISOString();
    expect((await webhook({ awb, status: "IN_TRANSIT", eventId: "e2", occurredAt: inTransitAt })).statusCode).toBe(200);
    // A late update from before the last one is recorded, but moves nothing back.
    expect((await webhook({ awb, status: "PICKED_UP", eventId: "e0", occurredAt: new Date(Date.now() + 500).toISOString() })).statusCode).toBe(200);

    let shipment = await app.prisma.shipment.findUniqueOrThrow({ where: { orderId }, include: { events: true } });
    expect(shipment.status).toBe("IN_TRANSIT");
    expect(shipment.events.filter((event) => event.providerEventId === "e1")).toHaveLength(1);
    expect(await history(orderId)).toEqual(["CONFIRMED", "PACKED", "SHIPPED", "IN_TRANSIT"]);
    expect((await call(app, "POST", `${orderPath}/shipment/cancel`, { token: staff })).body.error).toBe("SHIPMENT_NOT_CANCELLABLE");
    expect((await call(app, "POST", `${orderPath}/cancel`, { token: admin, body: { reason: "Too late" } })).status).toBe(409);

    expect((await webhook({ shipmentId: shipment.providerShipmentId, status: "DELIVERED", eventId: "e3", occurredAt: new Date(Date.now() + 5000).toISOString() })).statusCode).toBe(200);
    expect((await webhook({ awb, status: "RTO_IN_TRANSIT", eventId: "e4", occurredAt: new Date(Date.now() + 7000).toISOString() })).statusCode).toBe(200);

    shipment = await app.prisma.shipment.findUniqueOrThrow({ where: { orderId }, include: { events: true } });
    expect(shipment.status).toBe("DELIVERED");
    const order = await app.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { payment: true } });
    expect(order.status).toBe("DELIVERED");
    expect(order.payment).toMatchObject({ status: "PAID", provider: "cash" });
    expect(await history(orderId)).toEqual(["CONFIRMED", "PACKED", "SHIPPED", "IN_TRANSIT", "DELIVERED"]);

    const tracking = await call(app, "GET", `/orders/${orderId}`, { token: customer });
    expect(tracking.body.shipment).toEqual({
      status: "DELIVERED",
      courierName: "Test Courier",
      awb,
      trackingUrl: null,
      events: expect.arrayContaining([expect.objectContaining({ status: "PICKED_UP", location: "Pune" })]),
    });
  });

  it("marks the order RTO when the parcel is sent back", async () => {
    const { orderId, orderPath } = await packedOrder();
    const awb = (await call(app, "POST", `${orderPath}/shipment`, { token: staff, body: parcel })).body.shipment.awb;
    await webhook({ awb, status: "PICKED_UP", eventId: "p", occurredAt: new Date(Date.now() + 1000).toISOString() });
    await webhook({ awb, status: "NDR", eventId: "n", occurredAt: new Date(Date.now() + 2000).toISOString(), description: "Customer unavailable" });
    expect((await app.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("SHIPPED");
    await webhook({ awb, status: "RTO_IN_TRANSIT", eventId: "r", occurredAt: new Date(Date.now() + 3000).toISOString() });
    expect(await history(orderId)).toEqual(["CONFIRMED", "PACKED", "SHIPPED", "RTO"]);
  });

  it("cancels before pickup, and ships again on the same record", async () => {
    const { orderId, orderPath } = await packedOrder();
    const first = await call(app, "POST", `${orderPath}/shipment`, { token: staff, body: parcel });
    const cancelled = await call(app, "POST", `${orderPath}/shipment/cancel`, { token: staff });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toMatchObject({ status: "PACKED", shipment: { status: "CANCELLED" } });
    expect((await call(app, "POST", `${orderPath}/shipment/label`, { token: staff })).status).toBe(404);

    // A webhook for the cancelled booking no longer moves the order.
    await webhook({ awb: first.body.shipment.awb, status: "PICKED_UP", eventId: "late", occurredAt: new Date(Date.now() + 1000).toISOString() });
    expect((await app.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("PACKED");

    const again = await call(app, "POST", `${orderPath}/shipment`, { token: staff, body: parcel });
    expect(again.status).toBe(201);
    expect(again.body.shipment.id).toBe(first.body.shipment.id);
    expect(again.body.shipment.awb).not.toBe(first.body.shipment.awb);
    expect(again.body.shipment.status).toBe("PICKUP_SCHEDULED");
    expect((await call(app, "POST", `${orderPath}/shipment/label`, { token: staff })).status).toBe(200);
    expect((await call(app, "POST", `${orderPath}/shipment/sync`, { token: staff })).status).toBe(200);
    expect(await app.prisma.shipment.count({ where: { orderId } })).toBe(1);
  });

  it("needs courier details for manual shipping", async () => {
    await call(app, "PATCH", "/settings/platform", { token: admin, body: { shippingProvider: "manual" } });
    try {
      const { orderPath } = await packedOrder();
      const missing = await call(app, "POST", `${orderPath}/shipment`, { token: staff, body: parcel });
      expect(missing.status).toBe(400);
      expect(missing.body.error).toBe("COURIER_DETAILS_REQUIRED");
      const manual = await call(app, "POST", `${orderPath}/shipment`, {
        token: staff,
        body: { ...parcel, courierName: "DTDC", awb: "D1234567", trackingUrl: "https://www.dtdc.in/track" },
      });
      expect(manual.body).toMatchObject({ status: "SHIPPED", shipment: { labelUrl: null, trackingUrl: "https://www.dtdc.in/track" } });
      expect((await call(app, "POST", `${orderPath}/shipment/label`, { token: staff })).body.error).toBe("LABEL_NOT_AVAILABLE");

      const { orderPath: other } = await packedOrder();
      const taken = await call(app, "POST", `${other}/shipment`, { token: staff, body: { ...parcel, courierName: "DTDC", awb: "D1234567" } });
      expect(taken.status).toBe(409);
      expect(taken.body.error).toBe("AWB_IN_USE");
    } finally {
      await call(app, "PATCH", "/settings/platform", { token: admin, body: { shippingProvider: "mock" } });
    }
  });
});
