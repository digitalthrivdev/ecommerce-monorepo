import type { FastifyPluginAsync } from "fastify";

import {
  adjustInventoryBodySchema,
  inventoryItemParamsSchema,
  listAdjustmentsQuerySchema,
  listInventoryQuerySchema,
  storeParamsSchema,
} from "./inventory.schemas.js";
import { createInventoryService } from "./inventory.service.js";

const inventoryRoutes: FastifyPluginAsync = async (app) => {
  const inventoryService = createInventoryService(app.prisma);

  app.addHook("preHandler", app.requireStoreAccess);

  app.get("/", async (request) => {
    const { storeId } = storeParamsSchema.parse(request.params);
    const query = listInventoryQuerySchema.parse(request.query);
    return inventoryService.listInventory(storeId, query);
  });

  app.patch("/:variantId", async (request) => {
    const { storeId, variantId } = inventoryItemParamsSchema.parse(request.params);
    const body = adjustInventoryBodySchema.parse(request.body);
    return inventoryService.adjustInventory(storeId, variantId, body, request.user.sub);
  });

  app.get("/:variantId/adjustments", async (request) => {
    const { storeId, variantId } = inventoryItemParamsSchema.parse(request.params);
    const query = listAdjustmentsQuerySchema.parse(request.query);
    return inventoryService.listAdjustments(storeId, variantId, query);
  });
};

export default inventoryRoutes;
