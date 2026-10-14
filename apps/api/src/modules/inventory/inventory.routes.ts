import type { FastifyPluginAsync } from "fastify";

import { UserRole } from "../../generated/prisma/client";
import {
  adjustInventoryBodySchema,
  inventoryItemParamsSchema,
  listAdjustmentsQuerySchema,
  listInventoryQuerySchema,
} from "./inventory.schemas.js";
import { createInventoryService } from "./inventory.service.js";

const inventoryRoutes: FastifyPluginAsync = async (app) => {
  const inventoryService = createInventoryService(app.prisma);

  app.addHook("preHandler", app.requireRole(UserRole.ADMIN, UserRole.STAFF));

  app.get("/", async (request) => {
    const query = listInventoryQuerySchema.parse(request.query);
    return inventoryService.listInventory(query);
  });

  app.patch("/:variantId", { preHandler: app.forbidTestAccount }, async (request) => {
    const { variantId } = inventoryItemParamsSchema.parse(request.params);
    const body = adjustInventoryBodySchema.parse(request.body);
    return inventoryService.adjustInventory(variantId, body, request.user.sub);
  });

  app.get("/:variantId/adjustments", async (request) => {
    const { variantId } = inventoryItemParamsSchema.parse(request.params);
    const query = listAdjustmentsQuerySchema.parse(request.query);
    return inventoryService.listAdjustments(variantId, query);
  });
};

export default inventoryRoutes;
