import type { FastifyPluginAsync } from "fastify";

import { UserRole } from "../../generated/prisma/client";
import {
  createPartnerBodySchema,
  listPartnersQuerySchema,
  partnerParamsSchema,
  updatePartnerBodySchema,
} from "./delivery.schemas.js";
import { createPartnersService } from "./partners.service.js";
import { createTrackingService } from "./tracking.service.js";

/** Admin management of delivery partners. */
const partnersRoutes: FastifyPluginAsync = async (app) => {
  const partners = createPartnersService(app.prisma, createTrackingService(app.prisma, app.redis));

  app.addHook("preHandler", app.requireRole(UserRole.ADMIN));

  app.get("/", async (request) => {
    const query = listPartnersQuerySchema.parse(request.query);
    return partners.listPartners(query);
  });

  app.get("/:id", async (request) => {
    const { id } = partnerParamsSchema.parse(request.params);
    return partners.getPartner(id);
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
};

export default partnersRoutes;
