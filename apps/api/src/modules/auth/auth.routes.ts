import { randomUUID } from "node:crypto";

import type { FastifyPluginAsync } from "fastify";

import { getPlatformSettings } from "../settings/settings.service.js";
import { createAuthService } from "./auth.service.js";
import { loginBodySchema, lookupPhoneBodySchema, sendOtpBodySchema, verifyOtpBodySchema } from "./auth.schemas.js";

const authRoutes: FastifyPluginAsync = async (app) => {
  const authService = createAuthService({
    prisma: app.prisma,
    redis: app.redis,
    otp: app.otp,
    // The ID lets one token be revoked on sign-out.
    signToken: (payload) => app.jwt.sign({ ...payload, jti: randomUUID() }),
  });

  app.post("/lookup-phone", async (request) => {
    const { phone } = lookupPhoneBodySchema.parse(request.body);
    const user = await app.prisma.user.findUnique({
      where: { phone },
      select: { id: true, name: true, role: true },
    });
    const settings = await getPlatformSettings(app.prisma);
    const addressCount = user ? await app.prisma.address.count({ where: { userId: user.id } }) : 0;
    return {
      exists: Boolean(user),
      requireOtp: settings.requireCheckoutOtp,
      hasSavedAddresses: addressCount > 0,
      name: user?.name ?? null,
    };
  });

  app.post("/send-otp", async (request) => {
    const { phone } = sendOtpBodySchema.parse(request.body);
    const result = await authService.sendOtp(phone, request.ip);
    return { message: "OTP sent", ...result };
  });

  app.post("/verify-otp", async (request) => {
    const { phone, otp } = verifyOtpBodySchema.parse(request.body);
    return authService.verifyOtp(phone, otp);
  });

  app.post("/login", async (request) => {
    const { email, password } = loginBodySchema.parse(request.body);
    return authService.login(email, password, request.ip);
  });

  app.post("/logout", { preHandler: app.authenticate }, async (request, reply) => {
    await app.revokeToken(request.user);
    return reply.status(204).send();
  });
};

export default authRoutes;
