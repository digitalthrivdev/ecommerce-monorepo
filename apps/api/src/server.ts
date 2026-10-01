import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";

import { env } from "./config/env.js";
import prismaPlugin from "./plugins/prisma.js";
import redisPlugin from "./plugins/redis.js";

const app = Fastify({
  logger: true,
});

async function start() {
  await app.register(cors);
  await app.register(helmet);

  await app.register(prismaPlugin);
  await app.register(redisPlugin);

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

  try {
    await app.listen({
      port: env.PORT,
      host: env.HOST,
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

start();
