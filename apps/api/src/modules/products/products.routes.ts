import type { FastifyPluginAsync, FastifyRequest } from "fastify";

import { UserRole } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { idParamsSchema } from "../../shared/schemas.js";
import {
  createProductBodySchema,
  createStoreProductBodySchema,
  listProductsQuerySchema,
  listStoreProductsQuerySchema,
  storeParamsSchema,
  storeProductParamsSchema,
  updateProductBodySchema,
  updateStoreProductBodySchema,
} from "./products.schemas.js";
import { createProductsService } from "./products.service.js";
import { createStoreProductsService } from "./store-products.service.js";

export const productsRoutes: FastifyPluginAsync = async (app) => {
  const productsService = createProductsService(app.prisma);
  const storeProductsService = createStoreProductsService(app.prisma);
  const requireAdmin = app.requireRole(UserRole.ADMIN);

  const isAdmin = async (request: FastifyRequest) =>
    (await app.tryAuthenticate(request)) && request.user.role === UserRole.ADMIN;

  app.get("/", async (request) => {
    const query = listProductsQuerySchema.parse(request.query);

    if (query.includeInactive) {
      await requireAdmin(request);
    }

    return productsService.listProducts(query);
  });

  app.get("/:id", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return productsService.getProduct(id, { includeInactive: await isAdmin(request) });
  });

  app.get("/:id/listings", { preHandler: requireAdmin }, async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return storeProductsService.listProductListings(id);
  });

  app.post("/", { preHandler: requireAdmin }, async (request, reply) => {
    const body = createProductBodySchema.parse(request.body);
    const product = await productsService.createProduct(body);
    return reply.status(201).send(product);
  });

  app.patch("/:id", { preHandler: requireAdmin }, async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = updateProductBodySchema.parse(request.body);
    return productsService.updateProduct(id, body);
  });
};

export const storeProductsRoutes: FastifyPluginAsync = async (app) => {
  const storeProductsService = createStoreProductsService(app.prisma);
  const requireAdmin = app.requireRole(UserRole.ADMIN);

  const canManage = async (request: FastifyRequest, storeId: string) =>
    (await app.tryAuthenticate(request)) && (await app.canManageStore(request, storeId));

  app.get("/", async (request) => {
    const { storeId } = storeParamsSchema.parse(request.params);
    const query = listStoreProductsQuerySchema.parse(request.query);

    if (query.includeUnavailable) {
      await app.requireStoreAccess(request);
    }

    return storeProductsService.listStoreProducts(storeId, query, {
      canManage: await canManage(request, storeId),
    });
  });

  app.get("/:productId", async (request) => {
    const { storeId, productId } = storeProductParamsSchema.parse(request.params);
    return storeProductsService.getStoreProduct(storeId, productId, {
      canManage: await canManage(request, storeId),
    });
  });

  app.post("/", { preHandler: requireAdmin }, async (request, reply) => {
    const { storeId } = storeParamsSchema.parse(request.params);
    const body = createStoreProductBodySchema.parse(request.body);
    const storeProduct = await storeProductsService.createStoreProduct(storeId, body);
    return reply.status(201).send(storeProduct);
  });

  app.patch("/:productId", { preHandler: app.requireStoreAccess }, async (request) => {
    const { storeId, productId } = storeProductParamsSchema.parse(request.params);
    const body = updateStoreProductBodySchema.parse(request.body);

    if (request.user.role !== UserRole.ADMIN && (body.sellingPrice !== undefined || body.mrp !== undefined)) {
      throw new AppError(403, "FORBIDDEN", "Only admins can change prices");
    }

    return storeProductsService.updateStoreProduct(storeId, productId, body);
  });
};
