import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { UserRole } from "../../generated/prisma/client";
import { idParamsSchema } from "../../shared/schemas.js";
import { adminLowRatingsQuerySchema, rateOrderBodySchema, storeLowRatingsQuerySchema } from "./ratings.schemas.js";
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

/** Low ratings across stores, for admins. Prefix: /admin/ratings */
export const adminRatingsRoutes: FastifyPluginAsync = async (app) => {
  const service = createRatingsService(app.prisma);

  app.addHook("preHandler", app.requireRole(UserRole.ADMIN));

  app.get("/", async (request) => service.listLowRatings(adminLowRatingsQuerySchema.parse(request.query)));
};

/** Low ratings of one store's orders, for its staff and admins. Prefix: /stores/:storeId/ratings */
export const storeRatingsRoutes: FastifyPluginAsync = async (app) => {
  const service = createRatingsService(app.prisma);

  app.addHook("preHandler", app.requireStoreAccess);

  app.get("/", async (request) => {
    const { storeId } = z.object({ storeId: z.string().trim().min(1).max(64) }).parse(request.params);
    return service.listLowRatings({ ...storeLowRatingsQuerySchema.parse(request.query), storeId });
  });
};
