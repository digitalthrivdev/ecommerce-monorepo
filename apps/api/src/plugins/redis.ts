import fp from "fastify-plugin";

import { redis } from "../infrastructure/redis/client.js";

export default fp(async (app) => {
  await redis.ping();

  app.decorate("redis", redis);

  app.addHook("onClose", async () => {
    redis.disconnect();
  });
});
