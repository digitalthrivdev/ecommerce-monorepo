import type { FastifyPluginAsync } from "fastify";

import { UserRole } from "../../generated/prisma/client";
import { createDashboardService } from "./dashboard.service.js";

const dashboardRoutes: FastifyPluginAsync = async (app) => {
  const dashboard = createDashboardService(app.prisma);

  app.get("/", { preHandler: app.requireRole(UserRole.ADMIN, UserRole.STAFF) }, async (request) =>
    dashboard.getDashboard({ isAdmin: request.user.role === UserRole.ADMIN }),
  );
};

export default dashboardRoutes;
