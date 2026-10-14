import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { call, dashboardLogin, otpLogin, SEED, startApp } from "./helpers";

let app: FastifyInstance;
let admin: string;
let customer: string;
let categoryId: string;
let received: string;
let unavailable: string;
let orderId: string;

async function stockedProduct() {
  const sku = `REV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
  const created = await call(app, "POST", "/products", {
    token: admin,
    body: { name: `Review Test ${sku}`, categoryId, gstRate: "5", variants: [{ sku, price: "120" }] },
  });
  expect(created.status).toBe(201);
  const variantId: string = created.body.variants[0].id;
  expect((await call(app, "PATCH", `/inventory/${variantId}`, { token: admin, body: { delta: 10, reason: "RESTOCK" } })).status).toBeLessThan(300);
  return { id: created.body.id as string, variantId };
}

const review = (productId: string, body: unknown, token: string | null = customer) =>
  call(app, "PUT", `/products/${productId}/review`, { token: token ?? undefined, body });
const reviews = (productId: string) => call(app, "GET", `/products/${productId}/reviews`);

beforeAll(async () => {
  app = await startApp();
  admin = await dashboardLogin(app, SEED.adminEmail);
  customer = await otpLogin(app, SEED.customerPhone);
  categoryId = (await app.prisma.category.findFirstOrThrow({ where: { parentId: { not: null } } })).id;

  const [first, second] = [await stockedProduct(), await stockedProduct()];
  received = first.id;
  unavailable = second.id;

  const address = await call(app, "POST", "/users/me/addresses", {
    token: customer,
    body: {
      name: "Review Customer",
      phone: SEED.customerPhone,
      addressLine1: "12 Test Street",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560034",
    },
  });
  expect(address.status).toBe(201);
  await call(app, "DELETE", "/cart", { token: customer });
  for (const variantId of [first.variantId, second.variantId]) {
    expect((await call(app, "POST", "/cart/items", { token: customer, body: { variantId, quantity: 1 } })).status).toBeLessThan(300);
  }
  const order = await call(app, "POST", "/orders", { token: customer, body: { addressId: address.body.id, paymentMethod: "COD" } });
  expect(order.status).toBe(201);
  orderId = order.body.id;
});

afterAll(async () => {
  await app.close();
});

describe("product reviews", () => {
  it("waits for the order to be delivered", async () => {
    const early = await review(received, { rating: 4 });
    expect(early.status).toBe(409);
    expect(early.body.error).toBe("PRODUCT_NOT_RECEIVED");
    expect((await call(app, "GET", `/orders/${orderId}/reviews`, { token: customer })).body).toEqual({ items: [] });

    await app.prisma.orderItem.updateMany({ where: { orderId, productId: unavailable }, data: { unavailableQuantity: 1 } });
    await app.prisma.order.update({ where: { id: orderId }, data: { status: "DELIVERED" } });
  });

  it("lets the customer rate what they received and edit it", async () => {
    const created = await review(received, { rating: 4, comment: "  Fresh and tasty  " });
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({ productId: received, rating: 4, comment: "Fresh and tasty" });

    const order = await call(app, "GET", `/orders/${orderId}/reviews`, { token: customer });
    expect(order.status).toBe(200);
    expect(order.body.items).toEqual([expect.objectContaining({ productId: received, rating: 4, comment: "Fresh and tasty" })]);

    const listed = await reviews(received);
    expect(listed.status).toBe(200);
    expect(listed.body).toMatchObject({ average: "4.0", count: 1, distribution: [0, 0, 0, 1, 0], total: 1 });
    expect(listed.body.items[0]).toMatchObject({ rating: 4, comment: "Fresh and tasty", name: expect.any(String), verified: true });
    expect(listed.body.items[0]).not.toHaveProperty("user");

    expect((await review(received, { rating: 5 })).body).toMatchObject({ rating: 5, comment: "Fresh and tasty" });
    expect((await reviews(received)).body).toMatchObject({ average: "5.0", count: 1 });

    expect((await review(received, { rating: 5, comment: null })).body.comment).toBeNull();
    expect((await reviews(received)).body).toMatchObject({ count: 1, total: 0, items: [] });
    expect(await app.prisma.productReview.count({ where: { productId: received } })).toBe(1);
  });

  it("refuses products that were out of stock or never ordered", async () => {
    const outOfStock = await review(unavailable, { rating: 3 });
    expect(outOfStock.status).toBe(409);
    expect(outOfStock.body.error).toBe("PRODUCT_NOT_RECEIVED");

    const other = await stockedProduct();
    expect((await review(other.id, { rating: 3 })).body.error).toBe("PRODUCT_NOT_RECEIVED");
  });

  it("checks the rating and comment", async () => {
    expect((await review(received, { rating: 0 })).status).toBe(400);
    expect((await review(received, { rating: 6 })).status).toBe(400);
    expect((await review(received, { rating: 4.5 })).status).toBe(400);
    expect((await review(received, {})).status).toBe(400);
    expect((await review(received, { rating: 4, comment: "x".repeat(501) })).status).toBe(400);
  });

  it("answers unknown products and orders with 404", async () => {
    expect((await review("missing-product", { rating: 4 })).status).toBe(404);
    expect((await reviews("missing-product")).status).toBe(404);
    expect((await call(app, "GET", "/orders/missing-order/reviews", { token: customer })).status).toBe(404);
  });

  it("is only for signed-in customers", async () => {
    const staff = await dashboardLogin(app, SEED.staffEmail);
    expect((await review(received, { rating: 4 }, null)).status).toBe(401);
    expect((await review(received, { rating: 4 }, staff)).status).toBe(403);
    expect((await review(received, { rating: 4 }, admin)).status).toBe(403);
    expect((await call(app, "GET", `/orders/${orderId}/reviews`)).status).toBe(401);
  });
});

describe("reviews added by admins", () => {
  const add = (body: Record<string, unknown>, token: string | null = admin) =>
    call(app, "POST", "/admin/reviews", { token: token ?? undefined, body: { rating: 5, authorName: "Asha R.", ...body } });

  it("adds a named review that counts toward the rating but is not verified", async () => {
    const product = await stockedProduct();
    const created = await add({ productId: product.id, rating: 5, comment: "Crunchy and fresh" });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ productId: product.id, source: "ADMIN", authorName: "Asha R.", rating: 5, comment: "Crunchy and fresh" });
    expect((await add({ productId: product.id, rating: 3, authorName: "Vikram" })).status).toBe(201);

    const listed = await reviews(product.id);
    expect(listed.body).toMatchObject({ average: "4.0", count: 2, distribution: [0, 0, 1, 0, 1], total: 1 });
    expect(listed.body.items[0]).toMatchObject({ name: "Asha R.", comment: "Crunchy and fresh", verified: false });

    const adminList = await call(app, "GET", "/admin/reviews", { token: admin, query: { source: "ADMIN" } });
    const item = adminList.body.items.find((candidate: { id: string }) => candidate.id === created.body.id);
    expect(item).toMatchObject({ source: "ADMIN", authorName: "Asha R.", customer: null, order: null, addedBy: expect.any(String) });
    expect(adminList.body.items.every((candidate: { source: string }) => candidate.source === "ADMIN")).toBe(true);

    expect((await call(app, "DELETE", `/admin/reviews/${created.body.id}`, { token: admin })).body).toEqual({ id: created.body.id });
    expect((await reviews(product.id)).body).toMatchObject({ average: "3.0", count: 1, total: 0 });
    expect((await call(app, "DELETE", `/admin/reviews/${created.body.id}`, { token: admin })).status).toBe(404);
  });

  it("keeps customer reviews from being deleted", async () => {
    const customerReview = await app.prisma.productReview.findFirstOrThrow({ where: { productId: received, source: "CUSTOMER" } });
    const response = await call(app, "DELETE", `/admin/reviews/${customerReview.id}`, { token: admin });
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("CUSTOMER_REVIEW");
  });

  it("checks input, unknown products and access", async () => {
    expect((await add({ productId: received, authorName: "" })).status).toBe(400);
    expect((await add({ productId: received, authorName: "x".repeat(41) })).status).toBe(400);
    expect((await add({ productId: received, rating: 6 })).status).toBe(400);
    expect((await add({ productId: received, comment: "x".repeat(501) })).status).toBe(400);
    expect((await add({ productId: "missing-product" })).status).toBe(404);

    const staff = await dashboardLogin(app, SEED.staffEmail);
    expect((await add({ productId: received }, staff)).status).toBe(403);
    expect((await add({ productId: received }, customer)).status).toBe(403);
    expect((await add({ productId: received }, null)).status).toBe(401);
    expect((await call(app, "DELETE", "/admin/reviews/any", { token: staff })).status).toBe(403);
  });
});

describe("review moderation", () => {
  it("lets admins hide and show a review", async () => {
    await review(received, { rating: 2, comment: "Arrived squashed" });
    const listed = await call(app, "GET", "/admin/reviews", { token: admin, query: { rating: "2" } });
    expect(listed.status).toBe(200);
    const item = listed.body.items.find((candidate: { product: { id: string } }) => candidate.product.id === received);
    expect(item).toMatchObject({ rating: 2, comment: "Arrived squashed", isHidden: false, order: { id: orderId }, customer: { phone: SEED.customerPhone } });

    expect((await call(app, "PATCH", `/admin/reviews/${item.id}`, { token: admin, body: { isHidden: true } })).body).toEqual({ id: item.id, isHidden: true });
    expect((await reviews(received)).body).toMatchObject({ average: null, count: 0, items: [] });
    const hidden = await call(app, "GET", "/admin/reviews", { token: admin, query: { hidden: "true" } });
    expect(hidden.body.items.map((candidate: { id: string }) => candidate.id)).toContain(item.id);

    expect((await call(app, "PATCH", `/admin/reviews/${item.id}`, { token: admin, body: { isHidden: false } })).status).toBe(200);
    expect((await reviews(received)).body).toMatchObject({ average: "2.0", count: 1, total: 1 });
  });

  it("checks input, unknown reviews and access", async () => {
    const staff = await dashboardLogin(app, SEED.staffEmail);
    expect((await call(app, "PATCH", "/admin/reviews/missing-review", { token: admin, body: { isHidden: true } })).status).toBe(404);
    expect((await call(app, "PATCH", "/admin/reviews/missing-review", { token: admin, body: { isHidden: "yes" } })).status).toBe(400);
    expect((await call(app, "GET", "/admin/reviews", { token: admin, query: { rating: "9" } })).status).toBe(400);
    expect((await call(app, "GET", "/admin/reviews", { token: staff })).status).toBe(403);
    expect((await call(app, "GET", "/admin/reviews", { token: customer })).status).toBe(403);
    expect((await call(app, "GET", "/admin/reviews")).status).toBe(401);
  });
});
