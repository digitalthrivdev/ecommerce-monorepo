import type { FastifyPluginAsync, FastifyRequest } from "fastify";

import { UserRole } from "../../generated/prisma/client";
import { idParamsSchema } from "../../shared/schemas.js";
import {
  createCategoryBodySchema,
  listCategoriesQuerySchema,
  updateCategoryBodySchema,
} from "./categories.schemas.js";
import { createCategoriesService } from "./categories.service.js";

const categoriesRoutes: FastifyPluginAsync = async (app) => {
  const categoriesService = createCategoriesService(app.prisma);
  const requireAdmin = app.requireRole(UserRole.ADMIN);

  const isAdmin = async (request: FastifyRequest) =>
    (await app.tryAuthenticate(request)) && request.user.role === UserRole.ADMIN;

  app.get("/", async (request) => {
    const query = listCategoriesQuerySchema.parse(request.query);

    if (query.includeInactive) {
      await requireAdmin(request);
    }

    return categoriesService.listCategories(query);
  });

  app.get("/:id", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return categoriesService.getCategory(id, { includeInactive: await isAdmin(request) });
  });

  app.post("/", { preHandler: requireAdmin }, async (request, reply) => {
    const body = createCategoryBodySchema.parse(request.body);
    const category = await categoriesService.createCategory(body);
    return reply.status(201).send(category);
  });

  app.patch("/:id", { preHandler: requireAdmin }, async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = updateCategoryBodySchema.parse(request.body);
    return categoriesService.updateCategory(id, body);
  });
};

export default categoriesRoutes;
