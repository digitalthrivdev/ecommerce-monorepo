import { Readable } from "node:stream";

import type { FastifyPluginAsync } from "fastify";

import { UserRole } from "../../generated/prisma/client";
import { reportParamsSchema, reportQuerySchema } from "./reports.schemas.js";
import { createReportsService } from "./reports.service.js";

/** `GET /admin/reports/:report?from=YYYY-MM-DD&to=YYYY-MM-DD&storeId=…` as a CSV file. Admins only. */
const reportsRoutes: FastifyPluginAsync = async (app) => {
  const reports = createReportsService(app.prisma);

  app.addHook("preHandler", app.requireRole(UserRole.ADMIN));

  app.get("/:report", async (request, reply) => {
    const { report } = reportParamsSchema.parse(request.params);
    const query = reportQuerySchema.parse(request.query);

    // Checked before streaming starts, so errors still get a status code. The byte order mark makes
    // spreadsheets read the file as UTF-8.
    let body: Readable | string;
    if (report === "payments") {
      const lines = await reports.payments(query);
      body = Readable.from(
        (async function* () {
          yield "\uFEFF";
          yield* lines;
        })(),
      );
    } else {
      body = "\uFEFF" + (report === "daily-sales" ? await reports.dailySales(query) : await reports.gstSummary(query));
    }

    return reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="${report}_${query.from}_${query.to}.csv"`)
      .header("cache-control", "private, no-store")
      .send(body);
  });
};

export default reportsRoutes;
