import type { FastifyPluginAsync } from "fastify";

import { UserRole } from "../../generated/prisma/client";
import { idParamsSchema } from "../../shared/schemas.js";
import { couponBodySchema, listCouponsQuerySchema } from "./coupons.schemas.js";
import { createCouponsService } from "./coupons.service.js";

/** Coupons for admins. Customers apply a code through `/cart/coupon`. Prefix: /admin/coupons */
const adminCouponsRoutes: FastifyPluginAsync = async (app) => {
  const service = createCouponsService(app.prisma);

  app.addHook("preHandler", app.requireRole(UserRole.ADMIN));

  app.get("/", async (request) => service.listCoupons(listCouponsQuerySchema.parse(request.query)));

  app.get("/:id", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return service.getCoupon(id);
  });

  app.post("/", async (request, reply) => {
    const coupon = await service.createCoupon(couponBodySchema.parse(request.body));
    return reply.status(201).send(coupon);
  });

  /** Replaces every field; the dashboard form always sends them all. */
  app.put("/:id", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return service.updateCoupon(id, couponBodySchema.parse(request.body));
  });
};

export default adminCouponsRoutes;
