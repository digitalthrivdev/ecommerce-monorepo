import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { env } from "../../config/env.js";
import { UserRole } from "../../generated/prisma/client";
import { orderRefundBodySchema } from "../complaints/complaints.schemas.js";
import { createComplaintsService } from "../complaints/complaints.service.js";
import { createImageStore } from "../uploads/image-store.js";
import { createDashboardService } from "./dashboard.service.js";
import { manageOrdersQuerySchema } from "./orders.schemas.js";
import { createStoreOrdersService } from "./store-orders.service.js";

const idSchema = z.string().trim().min(1).max(64);

const adminListQuerySchema = manageOrdersQuerySchema.extend({ storeId: idSchema.optional() });

/**
 * Cross-store order views for admins. Actions on an order still go through
 * `/stores/:storeId/orders/:orderId/...` using the store returned here.
 */
const adminOrdersRoutes: FastifyPluginAsync = async (app) => {
  const storeOrders = createStoreOrdersService(app.prisma, app.payments);
  const dashboard = createDashboardService(app.prisma);
  const complaints = createComplaintsService(app.prisma, app.payments, app.notifications.notify, createImageStore(env.UPLOADS_DIR).root);

  app.addHook("preHandler", app.requireRole(UserRole.ADMIN));

  const actor = (userId: string) => ({ userId, isAdmin: true });

  app.get("/", async (request) => {
    const { storeId, ...query } = adminListQuerySchema.parse(request.query);
    return storeOrders.listOrders(storeId, query, actor(request.user.sub));
  });

  app.get("/attention", async () => dashboard.getAttention());

  app.get("/:orderId", async (request) => {
    const { orderId } = z.object({ orderId: idSchema }).parse(request.params);
    return storeOrders.getOrder(undefined, orderId, actor(request.user.sub));
  });

  /** A partial or full refund of a delivered order without a complaint, e.g. after the customer phoned. */
  app.post("/:orderId/refunds", async (request, reply) => {
    const { orderId } = z.object({ orderId: idSchema }).parse(request.params);
    const body = orderRefundBodySchema.parse(request.body);
    await complaints.refundOrder(orderId, body, request.user.sub);
    return reply.status(201).send(await storeOrders.getOrder(undefined, orderId, actor(request.user.sub)));
  });
};

export default adminOrdersRoutes;
