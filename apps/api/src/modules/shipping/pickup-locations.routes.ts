import type { FastifyPluginAsync } from "fastify";

import { UserRole } from "../../generated/prisma/client";
import { idParamsSchema } from "../../shared/schemas.js";
import { createPickupLocationBodySchema, updatePickupLocationBodySchema } from "./pickup-locations.schemas.js";
import { createPickupLocationsService } from "./pickup-locations.service.js";

/** Addresses carriers collect parcels from. Admins only. Prefix: /pickup-locations */
const pickupLocationsRoutes: FastifyPluginAsync = async (app) => {
  const service = createPickupLocationsService(app.prisma);

  app.addHook("preHandler", app.requireRole(UserRole.ADMIN));

  app.get("/", async () => service.listLocations());

  app.post("/", async (request, reply) => {
    const body = createPickupLocationBodySchema.parse(request.body);
    return reply.status(201).send(await service.createLocation(body));
  });

  app.patch("/:id", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = updatePickupLocationBodySchema.parse(request.body);
    return service.updateLocation(id, body);
  });

  app.delete("/:id", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    await service.deleteLocation(id);
    return reply.status(204).send();
  });
};

export default pickupLocationsRoutes;
