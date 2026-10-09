import type { FastifyPluginAsync, FastifyRequest } from "fastify";

import { UserRole } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { idParamsSchema } from "../../shared/schemas.js";
import { createDiscoveryService } from "./discovery.service.js";
import {
  addImageBodySchema,
  alsoBoughtQuerySchema,
  createProductBodySchema,
  createStoreVariantBodySchema,
  deleteProductsBodySchema,
  listProductsQuerySchema,
  listStoreProductsQuerySchema,
  productImageParamsSchema,
  reorderImagesBodySchema,
  setPricesBodySchema,
  storeParamsSchema,
  storeBrandsQuerySchema,
  storeProductParamsSchema,
  storeVariantParamsSchema,
  updateImageBodySchema,
  updateProductBodySchema,
  updateStoreVariantBodySchema,
  variantsBodySchema,
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

  app.get("/:id/preview", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return productsService.getPreview(id);
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

  /** Deletes never-ordered products and hides ordered ones; see deleteProducts. */
  app.post("/bulk-delete", { preHandler: requireAdmin }, async (request) => {
    const { ids } = deleteProductsBodySchema.parse(request.body);
    return productsService.deleteProducts(ids);
  });

  app.patch("/:id", { preHandler: requireAdmin }, async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = updateProductBodySchema.parse(request.body);
    return productsService.updateProduct(id, body);
  });

  app.put("/:id/variants", { preHandler: requireAdmin }, async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = variantsBodySchema.parse(request.body);
    return productsService.setVariants(id, body);
  });

  app.put("/:id/prices", { preHandler: requireAdmin }, async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = setPricesBodySchema.parse(request.body);
    return storeProductsService.setPrices(id, body);
  });

  app.post("/:id/images", { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = addImageBodySchema.parse(request.body);
    return reply.status(201).send(await productsService.addImage(id, body));
  });

  app.put("/:id/images/order", { preHandler: requireAdmin }, async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const { imageIds } = reorderImagesBodySchema.parse(request.body);
    return productsService.reorderImages(id, imageIds);
  });

  app.patch("/:id/images/:imageId", { preHandler: requireAdmin }, async (request) => {
    const { id, imageId } = productImageParamsSchema.parse(request.params);
    const body = updateImageBodySchema.parse(request.body);
    return productsService.updateImage(id, imageId, body);
  });

  app.delete("/:id/images/:imageId", { preHandler: requireAdmin }, async (request) => {
    const { id, imageId } = productImageParamsSchema.parse(request.params);
    return productsService.deleteImage(id, imageId);
  });
};

export const storeProductsRoutes: FastifyPluginAsync = async (app) => {
  const storeProductsService = createStoreProductsService(app.prisma);
  const discovery = createDiscoveryService(app.prisma);

  app.get("/also-bought", async (request) => {
    const { storeId } = storeParamsSchema.parse(request.params);
    const { productIds, limit } = alsoBoughtQuerySchema.parse(request.query);
    return discovery.alsoBought(storeId, productIds, limit);
  });

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
};

/** Brands with something in stock at the store. */
export const storeBrandsRoutes: FastifyPluginAsync = async (app) => {
  const discovery = createDiscoveryService(app.prisma);

  app.get("/", async (request) => {
    const { storeId } = storeParamsSchema.parse(request.params);
    const { categoryId, limit } = storeBrandsQuerySchema.parse(request.query);
    return discovery.listStoreBrands(storeId, categoryId, limit);
  });
};

/** A store's listing of each variant: price, MRP and whether it is offered. */
export const storeVariantsRoutes: FastifyPluginAsync = async (app) => {
  const storeProductsService = createStoreProductsService(app.prisma);
  const requireAdmin = app.requireRole(UserRole.ADMIN);

  app.post("/", { preHandler: requireAdmin }, async (request, reply) => {
    const { storeId } = storeParamsSchema.parse(request.params);
    const body = createStoreVariantBodySchema.parse(request.body);
    const listing = await storeProductsService.createStoreVariant(storeId, body);
    return reply.status(201).send(listing);
  });

  app.patch("/:variantId", { preHandler: app.requireStoreAccess }, async (request) => {
    const { storeId, variantId } = storeVariantParamsSchema.parse(request.params);
    const body = updateStoreVariantBodySchema.parse(request.body);

    if (request.user.role !== UserRole.ADMIN && (body.sellingPrice !== undefined || body.mrp !== undefined)) {
      throw new AppError(403, "FORBIDDEN", "Only admins can change prices");
    }

    return storeProductsService.updateStoreVariant(storeId, variantId, body);
  });
};
