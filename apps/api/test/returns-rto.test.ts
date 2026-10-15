import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { call, dashboardLogin, otpLogin, SEED, startApp } from "./helpers";

let app: FastifyInstance;
let admin: string;
let staff: string;
let customer: string;
let addressId: string;
let variantId: string;
let orderItemId: string;
let orderId: string;
let adminId: string;

async function createOrder() {
  await call(app, "DELETE", "/cart", { token: customer });
  expect((await call(app, "POST", "/cart/items", { token: customer, body: { variantId, quantity: 1 } })).status).toBe(200);
  const response = await call(app, "POST", "/orders", { token: customer, body: { addressId, paymentMethod: "COD" } });
  expect(response.status).toBe(201);
  return response.body.id as string;
}

beforeAll(async () => {
  app = await startApp();
  admin = await dashboardLogin(app, SEED.adminEmail);
  staff = await dashboardLogin(app, SEED.staffEmail);
  customer = await otpLogin(app, SEED.customerPhone);
  adminId = (await app.prisma.user.findUniqueOrThrow({ where: { email: SEED.adminEmail }, select: { id: true } })).id;
  const categoryId = (await app.prisma.category.findFirstOrThrow({ where: { parentId: { not: null } }, select: { id: true } })).id;
  const sku = `RET-${Date.now()}`;
  const product = await call(app, "POST", "/products", { token: admin, body: { name: "Return Test Item", categoryId, gstRate: "5", variants: [{ sku, price: "120" }] } });
  expect(product.status).toBe(201);
  variantId = product.body.variants[0].id;
  expect((await call(app, "PATCH", `/inventory/${variantId}`, { token: admin, body: { delta: 10, reason: "RESTOCK" } })).status).toBe(200);
  addressId = (await call(app, "POST", "/users/me/addresses", { token: customer, body: { name: "Return Customer", phone: SEED.customerPhone, addressLine1: "4 Return Road", city: "Pune", state: "Maharashtra", postalCode: "411001" } })).body.id;
});

afterAll(async () => {
  if (app) await call(app, "PATCH", "/settings/platform", { token: admin, body: { paymentProvider: null, returnWindowDays: 7 } });
  await app.close();
});

describe("returns and RTO", () => {
  it("approves a return, records reverse pickup, restocks and refunds once", async () => {
    orderId = await createOrder();
    const order = await app.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
    orderItemId = order.items[0]!.id;
    await app.prisma.order.update({ where: { id: orderId }, data: { status: "DELIVERED", payment: { update: { status: "PAID" } } } });
    await app.prisma.orderStatusHistory.create({ data: { orderId, fromStatus: "CONFIRMED", toStatus: "DELIVERED", changedById: adminId, note: "Test delivery" } });

    const path = `/orders/${orderId}/returns`;
    const body = { reason: "DAMAGED", note: "Item arrived damaged", items: [{ orderItemId, quantity: 1 }], photoUrls: [] };
    expect((await call(app, "POST", path, { body })).status).toBe(401);
    expect((await call(app, "POST", path, { token: staff, body })).status).toBe(403);
    expect((await call(app, "POST", path, { token: customer, body: { ...body, items: [{ orderItemId, quantity: 2 }] } })).status).toBe(400);
    expect((await call(app, "POST", path, { token: customer, body })).status).toBe(201);
    expect((await call(app, "POST", path, { token: customer, body })).status).toBe(409);

    const request = await app.prisma.complaint.findUniqueOrThrow({ where: { orderId } });
    const returnPath = `/admin/returns/${request.id}`;
    expect((await call(app, "POST", `${returnPath}/receive`, { token: admin, body: { amount: "120", method: "UPI", reference: "UPI-RETURN-1", note: "Received and refunded" } })).status).toBe(409);
    expect((await call(app, "POST", `${returnPath}/resolve`, { token: staff, body: { status: "APPROVED", note: "Approved" } })).status).toBe(403);
    const approved = await call(app, "POST", `${returnPath}/resolve`, { token: admin, body: { status: "APPROVED", note: "Approved" } });
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    expect((await call(app, "POST", `${returnPath}/reverse-pickup`, { token: admin, body: { courierName: "Manual Courier", awb: "RET-AWB-1", trackingUrl: "https://tracking.example/RET-AWB-1" } })).status).toBe(200);
    expect((await call(app, "POST", `${returnPath}/receive`, { token: admin, body: { amount: "121", method: "UPI", reference: "UPI-RETURN-1", note: "Received and refunded" } })).status).toBe(400);

    const before = (await app.prisma.inventory.findUniqueOrThrow({ where: { variantId }, select: { quantity: true } })).quantity;
    const received = await call(app, "POST", `${returnPath}/receive`, { token: admin, body: { amount: "120", method: "UPI", reference: "UPI-RETURN-1", note: "Received and refunded" } });
    expect(received.status).toBe(200);
    expect(received.body.status).toBe("RESOLVED");
    expect((await app.prisma.inventory.findUniqueOrThrow({ where: { variantId }, select: { quantity: true } })).quantity).toBe(before + 1);
    expect(await app.prisma.inventoryAdjustment.findFirst({ where: { variantId, changedById: adminId, note: { contains: "Return received" } } })).toMatchObject({ reason: "RESTOCK", delta: 1 });
    const refund = await app.prisma.refund.findFirstOrThrow({ where: { orderId, reason: "Received and refunded" } });
    expect(refund.method).toBe("UPI");
    expect(refund.amount.toFixed(2)).toBe("120.00");
    expect((await call(app, "POST", `${returnPath}/receive`, { token: admin, body: { amount: "120", method: "UPI", reference: "UPI-RETURN-1", note: "Received and refunded" } })).status).toBe(409);
  });

  it("uses the configured return window from the actual delivery time", async () => {
    const updated = await call(app, "PATCH", "/settings/platform", { token: admin, body: { returnWindowDays: 1 } });
    expect(updated.status).toBe(200);
    const expiredOrderId = await createOrder();
    const deliveredAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await app.prisma.order.update({ where: { id: expiredOrderId }, data: { status: "DELIVERED" } });
    await app.prisma.orderStatusHistory.create({ data: { orderId: expiredOrderId, fromStatus: "CONFIRMED", toStatus: "DELIVERED", changedById: adminId, note: "Old test delivery", createdAt: deliveredAt } });
    const refused = await call(app, "POST", `/orders/${expiredOrderId}/returns`, {
      token: customer,
      body: { reason: "DAMAGED", items: [{ orderItemId: (await app.prisma.orderItem.findFirstOrThrow({ where: { orderId: expiredOrderId }, select: { id: true } })).id, quantity: 1 }], photoUrls: [] },
    });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe("RETURN_WINDOW_CLOSED");
    await call(app, "PATCH", "/settings/platform", { token: admin, body: { returnWindowDays: 7 } });
  });

  it("restocks an RTO once and refuses non-admin or duplicate confirmation", async () => {
    const rtoOrderId = await createOrder();
    const path = `/admin/orders/${rtoOrderId}/rto/receive`;
    expect((await call(app, "POST", path, { token: staff })).status).toBe(403);
    expect((await call(app, "POST", "/admin/orders/missing-order/rto/receive", { token: admin })).status).toBe(404);
    expect((await call(app, "POST", path, { token: admin })).status).toBe(409);
    await app.prisma.order.update({ where: { id: rtoOrderId }, data: { status: "RTO" } });
    const before = (await app.prisma.inventory.findUniqueOrThrow({ where: { variantId }, select: { quantity: true } })).quantity;
    expect((await call(app, "POST", path, { token: admin })).status).toBe(200);
    expect((await app.prisma.inventory.findUniqueOrThrow({ where: { variantId }, select: { quantity: true } })).quantity).toBe(before + 1);
    expect(await app.prisma.inventoryAdjustment.findFirst({ where: { variantId, changedById: adminId, note: { contains: `RTO received for order ORD` } } })).toMatchObject({ reason: "RESTOCK", delta: 1 });
    expect((await call(app, "POST", path, { token: admin })).status).toBe(409);
    expect((await app.prisma.order.findUniqueOrThrow({ where: { id: rtoOrderId }, select: { rtoReceivedAt: true } })).rtoReceivedAt).toBeInstanceOf(Date);
  });

  it("refunds a paid online order through the configured test gateway when RTO is received", async () => {
    const configured = await call(app, "PATCH", "/settings/platform", { token: admin, body: { paymentProvider: "mock" } });
    expect(configured.status).toBe(200);
    await call(app, "DELETE", "/cart", { token: customer });
    expect((await call(app, "POST", "/cart/items", { token: customer, body: { variantId, quantity: 1 } })).status).toBe(200);
    const created = await call(app, "POST", "/orders", { token: customer, body: { addressId, paymentMethod: "ONLINE" } });
    expect(created.status).toBe(201);
    const rtoOrderId = created.body.id as string;
    const providerOrderId = `test-rto-${Date.now()}`;
    await app.prisma.payment.update({ where: { orderId: rtoOrderId }, data: { status: "PAID", provider: "mock", providerOrderId, transactionId: `payment-${Date.now()}` } });
    await app.prisma.order.update({ where: { id: rtoOrderId }, data: { status: "RTO" } });

    const response = await call(app, "POST", `/admin/orders/${rtoOrderId}/rto/receive`, { token: admin });
    expect(response.status).toBe(200);
    const payment = await app.prisma.payment.findUniqueOrThrow({ where: { orderId: rtoOrderId } });
    expect(payment.status).toBe("REFUNDED");
    expect(payment.refundedAmount.toFixed(2)).toBe(payment.amount.toFixed(2));
    expect(await app.prisma.refund.findFirst({ where: { orderId: rtoOrderId, reason: "RTO parcel received" } })).toMatchObject({ method: "GATEWAY" });
  });
});
