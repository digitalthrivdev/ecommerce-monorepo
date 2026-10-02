import type { FastifyPluginAsync, FastifyRequest } from "fastify";

import { UserRole } from "../../generated/prisma/client";
import { idParamsSchema } from "../../shared/schemas.js";
import { createBrandBodySchema, listBrandsQuerySchema, updateBrandBodySchema } from "./brands.schemas.js";
import { createBrandsService } from "./brands.service.js";

const brandsRoutes: FastifyPluginAsync = async (app) => {
  const brandsService = createBrandsService(app.prisma);
  const requireAdmin = app.requireRole(UserRole.ADMIN);

  const isAdmin = async (request: FastifyRequest) =>
    (await app.tryAuthenticate(request)) && request.user.role === UserRole.ADMIN;

  app.get("/", async (request) => {
    const query = listBrandsQuerySchema.parse(request.query);

    if (query.includeInactive) {
      await requireAdmin(request);
    }

    return brandsService.listBrands(query);
  });

  app.get("/:id", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return brandsService.getBrand(id, { includeInactive: await isAdmin(request) });
  });

  app.post("/", { preHandler: requireAdmin }, async (request, reply) => {
    const body = createBrandBodySchema.parse(request.body);
    const brand = await brandsService.createBrand(body);
    return reply.status(201).send(brand);
  });

  app.patch("/:id", { preHandler: requireAdmin }, async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = updateBrandBodySchema.parse(request.body);
    return brandsService.updateBrand(id, body);
  });
};

export default brandsRoutes;
