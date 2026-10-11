import type { FastifyPluginAsync } from "fastify";

import { UserRole } from "../../generated/prisma/client";
import { updateAppearanceBodySchema } from "./appearance.schemas.js";
import { createAppearanceService } from "./appearance.service.js";
import {
  gatewayParamsSchema,
  otpProviderParamsSchema,
  policyParamsSchema,
  reviewLoginBodySchema,
  saveGatewayKeysBodySchema,
  savePolicyBodySchema,
  updateSettingsBodySchema,
} from "./settings.schemas.js";
import { createSettingsService } from "./settings.service.js";
import { createWebsiteService } from "./website.service.js";

const settingsRoutes: FastifyPluginAsync = async (app) => {
  const settings = createSettingsService(app.prisma, app.otp);
  const appearance = createAppearanceService(app.prisma);
  const website = createWebsiteService(app.prisma);
  const adminOnly = { preHandler: app.requireRole(UserRole.ADMIN) };

  // Public: the apps load branding, theme, pricing and payment options at startup.
  app.get("/", async () => settings.getPublicSettings());

  // Public: the website on SITE_DOMAIN, whose policy pages the apps link to.
  app.get("/website", async () => website.getWebsite());

  app.get("/website/pages/:slug", async (request) => {
    const { slug } = policyParamsSchema.parse(request.params);
    return website.getPublic(slug);
  });

  app.get("/policy-pages", adminOnly, async () => website.listForEditing());

  app.put("/policy-pages/:slug", adminOnly, async (request) => {
    const { slug } = policyParamsSchema.parse(request.params);
    const { body } = savePolicyBodySchema.parse(request.body);
    return website.save(slug, body, request.user.sub);
  });

  app.delete("/policy-pages/:slug", adminOnly, async (request) => {
    const { slug } = policyParamsSchema.parse(request.params);
    return website.restoreTemplate(slug);
  });

  app.put("/review-login", adminOnly, async (request) => {
    const body = reviewLoginBodySchema.parse(request.body);
    return settings.saveReviewLogin("customer", body, request.user.sub);
  });

  app.put("/rider-review-login", adminOnly, async (request) => {
    const body = reviewLoginBodySchema.parse(request.body);
    return settings.saveReviewLogin("rider", body, request.user.sub);
  });

  app.get("/platform", adminOnly, async () => settings.getAdminSettings());

  app.patch("/platform", adminOnly, async (request) => {
    const body = updateSettingsBodySchema.parse(request.body);
    return settings.updateSettings(body, request.user.sub);
  });

  app.put("/payment-gateways/:gateway", adminOnly, async (request) => {
    const { gateway } = gatewayParamsSchema.parse(request.params);
    const { credentials } = saveGatewayKeysBodySchema.parse(request.body);
    return settings.saveGatewayKeys(gateway, credentials, request.user.sub);
  });

  app.delete("/payment-gateways/:gateway", adminOnly, async (request) => {
    const { gateway } = gatewayParamsSchema.parse(request.params);
    return settings.removeGatewayKeys(gateway);
  });

  app.put("/otp-providers/:provider", adminOnly, async (request) => {
    const { provider } = otpProviderParamsSchema.parse(request.params);
    const { credentials } = saveGatewayKeysBodySchema.parse(request.body);
    return settings.saveOtpProviderKeys(provider, credentials, request.user.sub);
  });

  app.delete("/otp-providers/:provider", adminOnly, async (request) => {
    const { provider } = otpProviderParamsSchema.parse(request.params);
    return settings.removeOtpProviderKeys(provider);
  });

  app.get("/appearance", adminOnly, async () => appearance.getAdminAppearance());

  app.patch("/appearance", adminOnly, async (request) => {
    const body = updateAppearanceBodySchema.parse(request.body);
    return appearance.updateAppearance(body, request.user.sub);
  });
};

export default settingsRoutes;
