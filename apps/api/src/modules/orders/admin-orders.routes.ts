import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { UserRole } from "../../generated/prisma/client";
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

  app.addHook("preHandler", app.requireRole(UserRole.ADMIN));

  const actor = (userId: string) => ({ userId, isAdmin: true });

  app.get("/", async (request) => {
    const { storeId, ...query } = adminListQuerySchema.parse(request.query);
    return storeOrders.listOrders(storeId, query, actor(request.user.sub));
  });

  app.get("/:orderId", async (request) => {
    const { orderId } = z.object({ orderId: idSchema }).parse(request.params);
    return storeOrders.getOrder(undefined, orderId, actor(request.user.sub));
  });
};

export default adminOrdersRoutes;
