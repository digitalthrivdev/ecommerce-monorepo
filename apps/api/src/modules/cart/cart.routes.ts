import type { FastifyPluginAsync } from "fastify";

import { UserRole } from "../../generated/prisma/client";
import { addCartItemBodySchema, cartItemParamsSchema, updateCartItemBodySchema } from "./cart.schemas.js";
import { createCartService } from "./cart.service.js";

const cartRoutes: FastifyPluginAsync = async (app) => {
  const cartService = createCartService(app.prisma);

  app.addHook("preHandler", app.requireRole(UserRole.CUSTOMER));

  app.get("/", async (request) => {
    return cartService.getCart(request.user.sub);
  });

  app.delete("/", async (request) => {
    return cartService.clearCart(request.user.sub);
  });

  app.post("/items", async (request) => {
    const body = addCartItemBodySchema.parse(request.body);
    return cartService.addItem(request.user.sub, body);
  });

  app.patch("/items/:id", async (request) => {
    const { id } = cartItemParamsSchema.parse(request.params);
    const { quantity } = updateCartItemBodySchema.parse(request.body);
    return cartService.updateItem(request.user.sub, id, quantity);
  });

  app.delete("/items/:id", async (request) => {
    const { id } = cartItemParamsSchema.parse(request.params);
    return cartService.removeItem(request.user.sub, id);
  });
};

export default cartRoutes;
