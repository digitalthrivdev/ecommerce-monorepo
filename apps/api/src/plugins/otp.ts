import fp from "fastify-plugin";

import { createOtpRegistry } from "../modules/auth/otp-registry.js";

export default fp(async (app) => {
  app.decorate("otp", createOtpRegistry({ prisma: app.prisma, redis: app.redis, log: app.log }));
});
