import type { FastifyPluginAsync } from "fastify";

import { UserRole } from "../../generated/prisma/client";
import { updateSettingsBodySchema } from "./settings.schemas.js";
import { createSettingsService } from "./settings.service.js";

const settingsRoutes: FastifyPluginAsync = async (app) => {
  const settings = createSettingsService(app.prisma);
  const adminOnly = { preHandler: app.requireRole(UserRole.ADMIN) };

  // Public: the apps load branding, pricing and payment options at startup.
  app.get("/", async () => settings.getPublicSettings());

  app.get("/platform", adminOnly, async () => settings.getAdminSettings());

  app.patch("/platform", adminOnly, async (request) => {
    const body = updateSettingsBodySchema.parse(request.body);
    return settings.updateSettings(body, request.user.sub);
  });
};

export default settingsRoutes;
