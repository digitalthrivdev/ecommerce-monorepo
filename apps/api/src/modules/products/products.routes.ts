import type { FastifyPluginAsync } from "fastify";

import { UserRole } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { idParamsSchema } from "../../shared/schemas.js";
import { createCatalogService } from "./catalog.service.js";
import { createDiscoveryService } from "./discovery.service.js";
import {
  addImageBodySchema,
  alsoBoughtQuerySchema,
  catalogBrandsQuerySchema,
  catalogProductParamsSchema,
  createProductBodySchema,
  deleteProductsBodySchema,
  listCatalogQuerySchema,
  listProductsQuerySchema,
  productImageParamsSchema,
  reorderImagesBodySchema,
  updateImageBodySchema,
  updateProductBodySchema,
  updateVariantBodySchema,
  variantParamsSchema,
  variantsBodySchema,
} from "./products.schemas.js";
import { createProductsService } from "./products.service.js";

/** The catalog as the dashboard manages it. Prefix: /products */
export const productsRoutes: FastifyPluginAsync = async (app) => {
  const productsService = createProductsService(app.prisma);
  const requireAdmin = app.requireRole(UserRole.ADMIN);
  const requireDashboard = app.requireRole(UserRole.ADMIN, UserRole.STAFF);

  app.get("/", { preHandler: requireDashboard }, async (request) => {
    const query = listProductsQuerySchema.parse(request.query);
    return productsService.listProducts(query);
  });

  app.get("/:id", { preHandler: requireDashboard }, async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return productsService.getProduct(id);
  });

  /** Public: what a shared product link shows. */
  app.get("/:id/preview", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return productsService.getPreview(id);
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

/** One variant's price and on/off switch. Staff may only switch it on or off. Prefix: /variants */
export const variantsRoutes: FastifyPluginAsync = async (app) => {
  const productsService = createProductsService(app.prisma);

  app.patch(
    "/:variantId",
    { preHandler: [app.requireRole(UserRole.ADMIN, UserRole.STAFF), app.forbidTestAccount] },
    async (request) => {
      const { variantId } = variantParamsSchema.parse(request.params);
      const body = updateVariantBodySchema.parse(request.body);

      if (request.user.role !== UserRole.ADMIN && (body.price !== undefined || body.compareAtPrice !== undefined)) {
        throw new AppError(403, "FORBIDDEN", "Only admins can change prices");
      }

      return productsService.updateVariant(variantId, body);
    },
  );
};

/** What customers browse, with prices and stock. Public. Prefix: /catalog/products */
export const catalogProductsRoutes: FastifyPluginAsync = async (app) => {
  const catalog = createCatalogService(app.prisma);
  const discovery = createDiscoveryService(app.prisma);

  app.get("/", async (request) => catalog.listProducts(listCatalogQuerySchema.parse(request.query)));

  app.get("/also-bought", async (request) => {
    const { productIds, limit } = alsoBoughtQuerySchema.parse(request.query);
    return discovery.alsoBought(productIds, limit);
  });

  app.get("/:productId", async (request) => {
    const { productId } = catalogProductParamsSchema.parse(request.params);
    return catalog.getProduct(productId);
  });
};

/** Brands with something in stock, optionally within a category. Public. Prefix: /catalog/brands */
export const catalogBrandsRoutes: FastifyPluginAsync = async (app) => {
  const discovery = createDiscoveryService(app.prisma);

  app.get("/", async (request) => {
    const { categoryId, limit } = catalogBrandsQuerySchema.parse(request.query);
    return { items: await discovery.inStockBrands({ categoryId, limit }) };
  });
};
