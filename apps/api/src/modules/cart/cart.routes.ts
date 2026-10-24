import type { FastifyPluginAsync } from "fastify";

import { UserRole } from "../../generated/prisma/client";
import { applyCouponBodySchema } from "../coupons/coupons.schemas.js";
import {
  addCartItemBodySchema,
  cartItemParamsSchema,
  cartPreviewBodySchema,
  updateCartItemBodySchema,
} from "./cart.schemas.js";
import { createCartService } from "./cart.service.js";

const cartRoutes: FastifyPluginAsync = async (app) => {
  const cartService = createCartService(app.prisma);

  app.post("/preview", async (request) => {
    const body = cartPreviewBodySchema.parse(request.body);
    return cartService.previewCart(body.items, body.couponCode);
  });

  await app.register(async (authed) => {
    authed.addHook("preHandler", authed.requireRole(UserRole.CUSTOMER));

    authed.get("/", async (request) => {
      return cartService.getCart(request.user.sub);
    });

    authed.delete("/", async (request) => {
      return cartService.clearCart(request.user.sub);
    });

    authed.post("/items", async (request) => {
      const body = addCartItemBodySchema.parse(request.body);
      return cartService.addItem(request.user.sub, body);
    });

    authed.patch("/items/:id", async (request) => {
      const { id } = cartItemParamsSchema.parse(request.params);
      const { quantity } = updateCartItemBodySchema.parse(request.body);
      return cartService.updateItem(request.user.sub, id, quantity);
    });

    authed.delete("/items/:id", async (request) => {
      const { id } = cartItemParamsSchema.parse(request.params);
      return cartService.removeItem(request.user.sub, id);
    });

    authed.put("/coupon", async (request) => {
      const { code } = applyCouponBodySchema.parse(request.body);
      return cartService.applyCoupon(request.user.sub, code);
    });

    authed.delete("/coupon", async (request) => cartService.removeCoupon(request.user.sub));
  });
};

export default cartRoutes;
