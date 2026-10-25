import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";

import { env } from "../../config/env.js";
import { UserRole } from "../../generated/prisma/client";
import { orderRefundBodySchema } from "../complaints/complaints.schemas.js";
import { createComplaintsService } from "../complaints/complaints.service.js";
import { shipmentEventBodySchema, shipOrderBodySchema, bulkShipOrdersBodySchema } from "../shipping/shipments.schemas.js";
import { createShipmentsService } from "../shipping/shipments.service.js";
import { createImageStore } from "../uploads/image-store.js";
import { createDashboardService } from "./dashboard.service.js";
import { FULFILMENT_ACTIONS, createManageOrdersService, type FulfilmentAction } from "./manage-orders.service.js";
import { manageOrdersQuerySchema } from "./orders.schemas.js";

const idSchema = z.string().trim().min(1).max(64);
const orderParamsSchema = z.object({ orderId: idSchema });
const itemParamsSchema = orderParamsSchema.extend({ itemId: idSchema });

const actionBodySchema = z
  .object({ note: z.string().trim().min(1).max(300).optional() })
  .default({});

const cancelBodySchema = z.object({
  reason: z.string().trim().min(1).max(300),
});

/** Omit quantity to mark every remaining unit unavailable. */
const unavailableBodySchema = z
  .object({ quantity: z.number().int().min(1).max(10_000).optional() })
  .default({});

/**
 * Orders in the dashboard. Staff pack and ship orders; recording tracking by hand and refunds are
 * admin-only.
 */
const adminOrdersRoutes: FastifyPluginAsync = async (app) => {
  const orders = createManageOrdersService(app.prisma, app.payments);
  const dashboard = createDashboardService(app.prisma);
  const shipments = createShipmentsService(app.prisma, app.log);
  const complaints = createComplaintsService(app.prisma, app.payments, app.notifications.notify, createImageStore(env.UPLOADS_DIR).root);
  const adminOnly = { preHandler: app.requireRole(UserRole.ADMIN) };

  app.addHook("preHandler", app.requireRole(UserRole.ADMIN, UserRole.STAFF));

  const actor = (request: FastifyRequest) => ({
    userId: request.user.sub,
    isAdmin: request.user.role === UserRole.ADMIN,
  });

  app.get("/", async (request) => {
    const query = manageOrdersQuerySchema.parse(request.query);
    return orders.listOrders(query, actor(request));
  });

  app.get("/attention", adminOnly, async () => dashboard.getAttention());

  app.get("/:orderId", async (request) => {
    const { orderId } = orderParamsSchema.parse(request.params);
    return orders.getOrder(orderId, actor(request));
  });

  for (const action of Object.keys(FULFILMENT_ACTIONS) as FulfilmentAction[]) {
    app.post(`/:orderId/${action}`, async (request) => {
      const { orderId } = orderParamsSchema.parse(request.params);
      const { note } = actionBodySchema.parse(request.body ?? undefined);
      await orders.performAction(orderId, action, actor(request), note);
      if (action === "pack") {
        await shipments.autoPushIfEnabled(orderId);
      }
      return orders.getOrder(orderId, actor(request));
    });
  }

  app.post("/bulk-ship", async (request) => {
    const { orderIds } = bulkShipOrdersBodySchema.parse(request.body);
    return shipments.bulkShipOrders(orderIds, actor(request));
  });

  app.post("/:orderId/shipment", async (request, reply) => {
    const { orderId } = orderParamsSchema.parse(request.params);
    const body = shipOrderBodySchema.parse(request.body);
    await shipments.shipOrder(orderId, body, actor(request));
    return reply.status(201).send(await orders.getOrder(orderId, actor(request)));
  });

  app.post("/:orderId/shipment/cancel", async (request) => {
    const { orderId } = orderParamsSchema.parse(request.params);
    await shipments.cancelShipment(orderId, actor(request));
    return orders.getOrder(orderId, actor(request));
  });

  app.post("/:orderId/shipment/label", async (request) => {
    const { orderId } = orderParamsSchema.parse(request.params);
    await shipments.refreshLabel(orderId);
    return orders.getOrder(orderId, actor(request));
  });

  app.post("/:orderId/shipment/sync", async (request) => {
    const { orderId } = orderParamsSchema.parse(request.params);
    await shipments.syncTracking(orderId);
    return orders.getOrder(orderId, actor(request));
  });

  /** Manually triggers a tracking sweep for all active carrier shipments. Admins only. */
  app.post("/shipments/sync-all", adminOnly, async () => {
    return shipments.sweepTracking();
  });

  /** For carriers without tracking: delivered marks cash on delivery as collected. */
  app.post("/:orderId/shipment/events", adminOnly, async (request) => {
    const { orderId } = orderParamsSchema.parse(request.params);
    const body = shipmentEventBodySchema.parse(request.body);
    await shipments.addEvent(orderId, body, actor(request));
    return orders.getOrder(orderId, actor(request));
  });

  app.post("/:orderId/cancel", async (request) => {
    const { orderId } = orderParamsSchema.parse(request.params);
    const { reason } = cancelBodySchema.parse(request.body);
    return orders.cancelOrder(orderId, actor(request), reason);
  });

  app.post("/:orderId/items/:itemId/unavailable", async (request) => {
    const { orderId, itemId } = itemParamsSchema.parse(request.params);
    const { quantity } = unavailableBodySchema.parse(request.body ?? undefined);
    return orders.markItemUnavailable(orderId, itemId, quantity, actor(request));
  });

  /** A partial or full refund of a delivered order without a complaint, e.g. after the customer phoned. */
  app.post("/:orderId/refunds", adminOnly, async (request, reply) => {
    const { orderId } = orderParamsSchema.parse(request.params);
    const body = orderRefundBodySchema.parse(request.body);
    await complaints.refundOrder(orderId, body, request.user.sub);
    return reply.status(201).send(await orders.getOrder(orderId, actor(request)));
  });

  app.post("/:orderId/rto/receive", adminOnly, async (request, reply) => {
    const { orderId } = orderParamsSchema.parse(request.params);
    await complaints.confirmRtoReceived(orderId, request.user.sub);
    return reply.status(200).send(await orders.getOrder(orderId, actor(request)));
  });
};

export default adminOrdersRoutes;
