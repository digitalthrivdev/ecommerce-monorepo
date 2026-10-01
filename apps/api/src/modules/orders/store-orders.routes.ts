import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";

import { OrderStatus, UserRole } from "../../generated/prisma/client";
import { paginationQuerySchema } from "../../shared/schemas.js";
import { assignBodySchema } from "../delivery/delivery.schemas.js";
import { createDeliveryService } from "../delivery/delivery.service.js";
import { STORE_ACTIONS, createStoreOrdersService, type StoreAction } from "./store-orders.service.js";

const idSchema = z.string().trim().min(1).max(64);
const storeParamsSchema = z.object({ storeId: idSchema });
const orderParamsSchema = z.object({ storeId: idSchema, orderId: idSchema });

const listQuerySchema = paginationQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(OrderStatus).optional(),
  sort: z.enum(["newest", "oldest"]).default("newest"),
});

const actionBodySchema = z
  .object({ note: z.string().trim().min(1).max(300).optional() })
  .default({});

const cancelBodySchema = z.object({
  reason: z.string().trim().min(1).max(300),
});

const storeOrdersRoutes: FastifyPluginAsync = async (app) => {
  const storeOrdersService = createStoreOrdersService(app.prisma, app.payments);
  const deliveryService = createDeliveryService(app.prisma, app.redis);

  app.addHook("preHandler", app.requireStoreAccess);

  const actor = (request: FastifyRequest) => ({
    userId: request.user.sub,
    isAdmin: request.user.role === UserRole.ADMIN,
  });

  app.get("/", async (request) => {
    const { storeId } = storeParamsSchema.parse(request.params);
    const query = listQuerySchema.parse(request.query);
    return storeOrdersService.listOrders(storeId, query, actor(request));
  });

  app.get("/:orderId", async (request) => {
    const { storeId, orderId } = orderParamsSchema.parse(request.params);
    return storeOrdersService.getOrder(storeId, orderId, actor(request));
  });

  for (const action of Object.keys(STORE_ACTIONS) as StoreAction[]) {
    app.post(`/:orderId/${action}`, async (request) => {
      const { storeId, orderId } = orderParamsSchema.parse(request.params);
      const { note } = actionBodySchema.parse(request.body ?? undefined);
      return storeOrdersService.performAction(storeId, orderId, action, actor(request), note);
    });
  }

  app.post("/:orderId/cancel", async (request) => {
    const { storeId, orderId } = orderParamsSchema.parse(request.params);
    const { reason } = cancelBodySchema.parse(request.body);
    return storeOrdersService.cancelOrder(storeId, orderId, actor(request), reason);
  });

  const adminOnly = { preHandler: app.requireRole(UserRole.ADMIN) };

  app.post("/:orderId/assign", adminOnly, async (request) => {
    const { storeId, orderId } = orderParamsSchema.parse(request.params);
    const { partnerId } = assignBodySchema.parse(request.body);
    await deliveryService.assign(storeId, orderId, partnerId, request.user.sub);
    return storeOrdersService.getOrder(storeId, orderId, actor(request));
  });

  app.post("/:orderId/reassign", adminOnly, async (request) => {
    const { storeId, orderId } = orderParamsSchema.parse(request.params);
    const { partnerId } = assignBodySchema.parse(request.body);
    await deliveryService.reassign(storeId, orderId, partnerId, request.user.sub);
    return storeOrdersService.getOrder(storeId, orderId, actor(request));
  });
};

export default storeOrdersRoutes;
