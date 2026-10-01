import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { UserRole } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { createDashboardService } from "./dashboard.service.js";

const dashboardQuerySchema = z.object({
  storeId: z.string().trim().min(1).max(64).optional(),
});

const dashboardRoutes: FastifyPluginAsync = async (app) => {
  const dashboard = createDashboardService(app.prisma);

  app.get("/", { preHandler: app.requireRole(UserRole.ADMIN, UserRole.STORE_STAFF) }, async (request) => {
    const { storeId } = dashboardQuerySchema.parse(request.query);

    if (request.user.role === UserRole.ADMIN) {
      return dashboard.getDashboard({ storeId, isAdmin: true });
    }

    // Staff always see their own store, read from the database so reassignment applies immediately.
    const staff = await app.prisma.user.findUnique({ where: { id: request.user.sub }, select: { storeId: true } });
    if (!staff?.storeId || (storeId && storeId !== staff.storeId)) {
      throw new AppError(403, "FORBIDDEN", "You do not have access to this store");
    }
    return dashboard.getDashboard({ storeId: staff.storeId, isAdmin: false });
  });
};

export default dashboardRoutes;
