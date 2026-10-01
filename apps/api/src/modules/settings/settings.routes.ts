import type { FastifyPluginAsync } from "fastify";

import { UserRole } from "../../generated/prisma/client";
import { updateAppearanceBodySchema } from "./appearance.schemas.js";
import { createAppearanceService } from "./appearance.service.js";
import { updateSettingsBodySchema } from "./settings.schemas.js";
import { createSettingsService } from "./settings.service.js";

const settingsRoutes: FastifyPluginAsync = async (app) => {
  const settings = createSettingsService(app.prisma);
  const appearance = createAppearanceService(app.prisma);
  const adminOnly = { preHandler: app.requireRole(UserRole.ADMIN) };

  // Public: the apps load branding, theme, pricing and payment options at startup.
  app.get("/", async () => settings.getPublicSettings());

  app.get("/platform", adminOnly, async () => settings.getAdminSettings());

  app.patch("/platform", adminOnly, async (request) => {
    const body = updateSettingsBodySchema.parse(request.body);
    return settings.updateSettings(body, request.user.sub);
  });

  app.get("/appearance", adminOnly, async () => appearance.getAdminAppearance());

  app.patch("/appearance", adminOnly, async (request) => {
    const body = updateAppearanceBodySchema.parse(request.body);
    return appearance.updateAppearance(body, request.user.sub);
  });
};

export default settingsRoutes;
