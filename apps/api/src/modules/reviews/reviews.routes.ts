import type { FastifyPluginAsync } from "fastify";

import { UserRole } from "../../generated/prisma/client";
import { idParamsSchema } from "../../shared/schemas.js";
import { adminReviewBodySchema, adminReviewsQuerySchema, productReviewsQuerySchema, reviewBodySchema, updateReviewBodySchema } from "./reviews.schemas.js";
import { createReviewsService } from "./reviews.service.js";

/** A product's reviews for anyone, and the signed-in customer's own review. Prefix: /products */
export const productReviewsRoutes: FastifyPluginAsync = async (app) => {
  const service = createReviewsService(app.prisma);

  app.get("/:id/reviews", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return service.productReviews(id, productReviewsQuerySchema.parse(request.query));
  });

  app.put("/:id/review", { preHandler: app.requireRole(UserRole.CUSTOMER) }, async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return service.reviewProduct(request.user.sub, id, reviewBodySchema.parse(request.body));
  });
};

/** The products of a customer's delivered order with their reviews. Prefix: /orders/:id/reviews */
export const orderReviewsRoutes: FastifyPluginAsync = async (app) => {
  const service = createReviewsService(app.prisma);

  app.get("/", { preHandler: app.requireRole(UserRole.CUSTOMER) }, async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return service.orderReviews(request.user.sub, id);
  });
};

/** Every product review, for moderation, and reviews added by admins. Prefix: /admin/reviews */
export const adminReviewsRoutes: FastifyPluginAsync = async (app) => {
  const service = createReviewsService(app.prisma);

  app.addHook("preHandler", app.requireRole(UserRole.ADMIN));

  app.get("/", async (request) => service.listReviews(adminReviewsQuerySchema.parse(request.query)));

  app.post("/", async (request, reply) => {
    return reply.status(201).send(await service.addReview(request.user.sub, adminReviewBodySchema.parse(request.body)));
  });

  app.patch("/:id", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return service.setHidden(id, updateReviewBodySchema.parse(request.body).isHidden);
  });

  app.delete("/:id", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return service.deleteReview(id);
  });
};
