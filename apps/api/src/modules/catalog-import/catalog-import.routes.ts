import type { FastifyPluginAsync } from "fastify";

import { env } from "../../config/env.js";
import { UserRole } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { publicBaseUrl } from "../payments/public-url.js";
import { createImageStore } from "../uploads/image-store.js";
import { createImportJobs } from "./catalog-import.jobs.js";
import { importBodySchema, importParamsSchema, MAX_FILE_BYTES } from "./catalog-import.schemas.js";
import { createCatalogImportService, importTemplate } from "./catalog-import.service.js";

/** The CSV travels as a JSON string, where quotes and line breaks are escaped. */
const BODY_LIMIT = MAX_FILE_BYTES * 2 + 64 * 1024;

/** Bulk import of products, variants, one store's prices and stock from a CSV file. Admins only. */
const catalogImportRoutes: FastifyPluginAsync = async (app) => {
  const service = createCatalogImportService(app.prisma);
  const jobs = createImportJobs({
    prisma: app.prisma,
    redis: app.redis,
    service,
    imageStore: createImageStore(env.UPLOADS_DIR),
    log: app.log,
  });

  // Before the body is read, so large uploads from anyone else are refused straight away.
  app.addHook("onRequest", app.requireRole(UserRole.ADMIN));

  app.get("/template", async (_request, reply) => {
    return reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", 'attachment; filename="catalog-import-template.csv"')
      .send(importTemplate());
  });

  /** Checks the file and reports what an import would do. Saves nothing. */
  app.post("/preview", { bodyLimit: BODY_LIMIT }, async (request) => {
    const { storeId, csv } = importBodySchema.parse(request.body);
    return service.summarize(await service.plan(storeId, csv));
  });

  /** Checks the file again and, if it has no errors, starts the import in the background. */
  app.post("/", { bodyLimit: BODY_LIMIT }, async (request, reply) => {
    const { storeId, csv } = importBodySchema.parse(request.body);
    const plan = await service.plan(storeId, csv);
    if (plan.errors.length > 0) {
      const { errors, errorCount } = service.summarize(plan);
      throw new AppError(400, "IMPORT_INVALID", "Fix the errors in the file before importing", { errors, errorCount });
    }
    const job = await jobs.start(plan, { changedById: request.user.sub, baseUrl: publicBaseUrl(request) });
    return reply.status(202).send(job);
  });

  app.get("/", async () => jobs.list());

  app.get("/:id", async (request) => {
    const { id } = importParamsSchema.parse(request.params);
    return jobs.get(id);
  });
};

export default catalogImportRoutes;
