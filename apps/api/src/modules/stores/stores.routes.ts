import type { FastifyPluginAsync, FastifyRequest } from "fastify";

import { UserRole } from "../../generated/prisma/client";
import { idParamsSchema } from "../../shared/schemas.js";
import {
  createStoreBodySchema,
  listStoresQuerySchema,
  serviceabilityQuerySchema,
  updateStoreBodySchema,
} from "./stores.schemas.js";
import { createStoresService } from "./stores.service.js";

const storesRoutes: FastifyPluginAsync = async (app) => {
  const storesService = createStoresService(app.prisma);
  const requireAdmin = app.requireRole(UserRole.ADMIN);

  async function isAdmin(request: FastifyRequest) {
    if (!request.headers.authorization) {
      return false;
    }

    try {
      await request.jwtVerify();
      return request.user.role === UserRole.ADMIN;
    } catch {
      return false;
    }
  }

  app.get("/", async (request) => {
    const query = listStoresQuerySchema.parse(request.query);

    if (query.includeInactive) {
      await requireAdmin(request);
    }

    return storesService.listStores(query);
  });

  app.get("/serviceability", async (request) => {
    const { latitude, longitude } = serviceabilityQuerySchema.parse(request.query);
    return storesService.findServiceableStore(latitude, longitude);
  });

  app.get("/:id", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return storesService.getStore(id, { includeInactive: await isAdmin(request) });
  });

  app.post("/", { preHandler: requireAdmin }, async (request, reply) => {
    const body = createStoreBodySchema.parse(request.body);
    const store = await storesService.createStore(body);
    return reply.status(201).send(store);
  });

  app.patch("/:id", { preHandler: requireAdmin }, async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = updateStoreBodySchema.parse(request.body);
    return storesService.updateStore(id, body);
  });
};

export default storesRoutes;
