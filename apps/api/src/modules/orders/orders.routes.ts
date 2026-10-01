import type { FastifyPluginAsync } from "fastify";

import { UserRole } from "../../generated/prisma/client";
import { idParamsSchema } from "../../shared/schemas.js";
import { createTrackingService } from "../delivery/tracking.service.js";
import { verifyPaymentBodySchema } from "../payments/payments.schemas.js";
import { cancelOrderBodySchema, createOrderBodySchema, listOrdersQuerySchema } from "./orders.schemas.js";
import { createOrdersService } from "./orders.service.js";

const ordersRoutes: FastifyPluginAsync = async (app) => {
  const ordersService = createOrdersService(app.prisma, app.payments);
  const tracking = createTrackingService(app.prisma, app.redis);

  app.addHook("preHandler", app.requireRole(UserRole.CUSTOMER));

  app.post("/", async (request, reply) => {
    const body = createOrderBodySchema.parse(request.body);
    const order = await ordersService.createOrder(request.user.sub, body);
    return reply.status(201).send(order);
  });

  app.get("/", async (request) => {
    const query = listOrdersQuerySchema.parse(request.query);
    return ordersService.listOrders(request.user.sub, query);
  });

  app.get("/:id", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return ordersService.getOrder(request.user.sub, id);
  });

  app.get("/:id/tracking", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return tracking.getCustomerTracking(request.user.sub, id);
  });

  app.post("/:id/cancel", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const { reason } = cancelOrderBodySchema.parse(request.body ?? undefined);
    return ordersService.cancelOrder(request.user.sub, id, reason);
  });

  app.post("/:id/payment", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return app.payments.startPayment(request.user.sub, id);
  });

  app.post("/:id/payment/verify", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = verifyPaymentBodySchema.parse(request.body);
    return ordersService.verifyPayment(request.user.sub, id, body);
  });
};

export default ordersRoutes;
