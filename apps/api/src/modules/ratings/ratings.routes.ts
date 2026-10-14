import type { FastifyPluginAsync } from "fastify";

import { UserRole } from "../../generated/prisma/client";
import { idParamsSchema } from "../../shared/schemas.js";
import { lowRatingsQuerySchema, rateOrderBodySchema } from "./ratings.schemas.js";
import { createRatingsService } from "./ratings.service.js";

/** A customer rating their delivered order. Prefix: /orders/:id/rating */
export const customerRatingsRoutes: FastifyPluginAsync = async (app) => {
  const service = createRatingsService(app.prisma);

  app.addHook("preHandler", app.requireRole(UserRole.CUSTOMER));

  app.post("/", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = rateOrderBodySchema.parse(request.body);
    return reply.status(201).send(await service.rateOrder(request.user.sub, id, body));
  });
};

/** Low ratings, for staff and admins. Prefix: /admin/ratings */
export const adminRatingsRoutes: FastifyPluginAsync = async (app) => {
  const service = createRatingsService(app.prisma);

  app.addHook("preHandler", app.requireRole(UserRole.ADMIN, UserRole.STAFF));

  app.get("/", async (request) => service.listLowRatings(lowRatingsQuerySchema.parse(request.query)));
};
