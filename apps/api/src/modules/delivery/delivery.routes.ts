import type { FastifyPluginAsync } from "fastify";

import { DeliveryPartnerStatus, UserRole } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import {
  declineBodySchema,
  deliveredBodySchema,
  deliveryOrderParamsSchema,
  earningsQuerySchema,
  historyQuerySchema,
  locationBodySchema,
  partnerStatusBodySchema,
} from "./delivery.schemas.js";
import { createDeliveryService } from "./delivery.service.js";
import { createTrackingService } from "./tracking.service.js";

/** Delivery partner app. */
const deliveryRoutes: FastifyPluginAsync = async (app) => {
  const delivery = createDeliveryService(app.prisma, app.redis);
  const tracking = createTrackingService(app.prisma, app.redis);

  app.addHook("preHandler", app.requireRole(UserRole.DELIVERY_PARTNER));

  app.get("/me", async (request) => delivery.getMe(request.user.sub));

  app.patch("/me/status", async (request) => {
    const { status } = partnerStatusBodySchema.parse(request.body);
    return delivery.setStatus(request.user.sub, status);
  });

  app.post("/location", async (request, reply) => {
    const body = locationBodySchema.parse(request.body);
    const partner = await delivery.resolvePartner(request.user.sub);
    if (partner.status === DeliveryPartnerStatus.OFFLINE) {
      throw new AppError(409, "PARTNER_OFFLINE", "Go online to share your location");
    }
    await tracking.recordLocation(partner.id, body);
    return reply.status(204).send();
  });

  app.get("/orders", async (request) => delivery.listActive(request.user.sub));

  app.get("/orders/:id", async (request) => {
    const { id } = deliveryOrderParamsSchema.parse(request.params);
    return delivery.getDelivery(request.user.sub, id);
  });

  app.post("/orders/:id/accept", async (request) => {
    const { id } = deliveryOrderParamsSchema.parse(request.params);
    return delivery.accept(request.user.sub, id);
  });

  app.post("/orders/:id/decline", async (request) => {
    const { id } = deliveryOrderParamsSchema.parse(request.params);
    const { reason } = declineBodySchema.parse(request.body ?? undefined);
    return delivery.decline(request.user.sub, id, reason);
  });

  app.post("/orders/:id/pickup", async (request) => {
    const { id } = deliveryOrderParamsSchema.parse(request.params);
    return delivery.pickup(request.user.sub, id);
  });

  app.post("/orders/:id/start-delivery", async (request) => {
    const { id } = deliveryOrderParamsSchema.parse(request.params);
    return delivery.startDelivery(request.user.sub, id);
  });

  app.post("/orders/:id/delivered", async (request) => {
    const { id } = deliveryOrderParamsSchema.parse(request.params);
    const { otp } = deliveredBodySchema.parse(request.body);
    return delivery.markDelivered(request.user.sub, id, otp);
  });

  app.get("/history", async (request) => {
    const query = historyQuerySchema.parse(request.query);
    return delivery.history(request.user.sub, query);
  });

  app.get("/earnings", async (request) => {
    const range = earningsQuerySchema.parse(request.query);
    return delivery.earnings(request.user.sub, range);
  });
};

export default deliveryRoutes;
