import type { FastifyPluginAsync } from "fastify";

import { createAuthService } from "./auth.service.js";
import { loginBodySchema, sendOtpBodySchema, verifyOtpBodySchema } from "./auth.schemas.js";

const authRoutes: FastifyPluginAsync = async (app) => {
  const authService = createAuthService({
    prisma: app.prisma,
    redis: app.redis,
    otp: app.otp,
    signToken: (payload) => app.jwt.sign(payload),
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
};

export default authRoutes;
