import type { FastifyPluginAsync } from "fastify";

import { UserRole } from "../../generated/prisma/client";
import {
  createPartnerBodySchema,
  depositsQuerySchema,
  historyQuerySchema,
  listPartnersQuerySchema,
  partnerParamsSchema,
  payoutParamsSchema,
  recordPayoutBodySchema,
  updatePartnerBodySchema,
  voidPayoutBodySchema,
} from "./delivery.schemas.js";
import { createPartnersService } from "./partners.service.js";
import { createPayoutsService } from "./payouts.service.js";
import { createTrackingService } from "./tracking.service.js";

/** Admin management of delivery partners and their payouts. */
const partnersRoutes: FastifyPluginAsync = async (app) => {
  const partners = createPartnersService(app.prisma, createTrackingService(app.prisma, app.redis));
  const payouts = createPayoutsService(app.prisma);

  app.addHook("preHandler", app.requireRole(UserRole.ADMIN));

  app.get("/", async (request) => {
    const query = listPartnersQuerySchema.parse(request.query);
    return partners.listPartners(query);
  });

  app.get("/:id", async (request) => {
    const { id } = partnerParamsSchema.parse(request.params);
    return partners.getPartner(id);
  });

  app.get("/:id/deliveries", async (request) => {
    const { id } = partnerParamsSchema.parse(request.params);
    const query = historyQuerySchema.parse(request.query);
    return partners.listDeliveries(id, query);
  });

  app.post("/", async (request, reply) => {
    const body = createPartnerBodySchema.parse(request.body);
    return reply.status(201).send(await partners.createPartner(body));
  });

  app.patch("/:id", async (request) => {
    const { id } = partnerParamsSchema.parse(request.params);
    const body = updatePartnerBodySchema.parse(request.body);
    return partners.updatePartner(id, body);
  });

  app.get("/:id/payouts", async (request) => {
    const { id } = partnerParamsSchema.parse(request.params);
    const query = depositsQuerySchema.parse(request.query);
    return payouts.listPayouts(id, query);
  });

  app.post("/:id/payouts", async (request, reply) => {
    const { id } = partnerParamsSchema.parse(request.params);
    const body = recordPayoutBodySchema.parse(request.body);
    return reply.status(201).send(await payouts.recordPayout(id, body, request.user.sub));
  });

  app.post("/payouts/:payoutId/void", async (request) => {
    const { payoutId } = payoutParamsSchema.parse(request.params);
    const { reason } = voidPayoutBodySchema.parse(request.body);
    return payouts.voidPayout(payoutId, reason, request.user.sub);
  });
};

export default partnersRoutes;
