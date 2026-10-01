import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";

import authPlugin from "./plugins/auth.js";
import errorHandlerPlugin from "./plugins/error-handler.js";
import prismaPlugin from "./plugins/prisma.js";
import redisPlugin from "./plugins/redis.js";
import authRoutes from "./modules/auth/auth.routes.js";
import storesRoutes from "./modules/stores/stores.routes.js";
import usersRoutes from "./modules/users/users.routes.js";

export async function buildApp() {
  const app = Fastify({
    logger: true,
  });

  await app.register(cors);
  await app.register(helmet);
  await app.register(errorHandlerPlugin);

  await app.register(prismaPlugin);
  await app.register(redisPlugin);
  await app.register(authPlugin);

  app.get("/health", async () => {
    await app.prisma.$queryRaw`SELECT 1`;

    const redisStatus = await app.redis.ping();

    return {
      status: "ok",
      service: "grocery-api",
      database: "ok",
      redis: redisStatus === "PONG" ? "ok" : "error",
    };
  });

  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(usersRoutes, { prefix: "/users" });
  await app.register(storesRoutes, { prefix: "/stores" });

  return app;
}
