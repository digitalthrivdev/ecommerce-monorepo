import type { FastifyPluginAsync } from "fastify";

import { UserRole } from "../../generated/prisma/client";
import { wishlistParamsSchema, wishlistQuerySchema } from "./wishlist.schemas.js";
import { createWishlistService } from "./wishlist.service.js";

/** Products the customer saved. Prefix: /wishlist */
const wishlistRoutes: FastifyPluginAsync = async (app) => {
  const wishlist = createWishlistService(app.prisma);

  app.addHook("preHandler", app.requireRole(UserRole.CUSTOMER));

  app.get("/", async (request) => wishlist.list(request.user.sub, wishlistQuerySchema.parse(request.query)));

  app.get("/ids", async (request) => wishlist.productIds(request.user.sub));

  app.put("/:productId", async (request) => {
    const { productId } = wishlistParamsSchema.parse(request.params);
    return wishlist.add(request.user.sub, productId);
  });

  app.delete("/:productId", async (request) => {
    const { productId } = wishlistParamsSchema.parse(request.params);
    return wishlist.remove(request.user.sub, productId);
  });
};

export default wishlistRoutes;
