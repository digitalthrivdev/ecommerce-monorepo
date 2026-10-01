import type { FastifyPluginAsync } from "fastify";

import { registerPushTokenBodySchema, unregisterPushTokenBodySchema } from "./notifications.schemas.js";

/** Device registration for push notifications. The apps register after sign-in and unregister on sign-out. */
const notificationsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  app.post("/push-tokens", async (request, reply) => {
    const body = registerPushTokenBodySchema.parse(request.body);
    await app.notifications.registerToken(request.user.sub, body);
    return reply.status(204).send();
  });

  app.delete("/push-tokens", async (request, reply) => {
    const { token } = unregisterPushTokenBodySchema.parse(request.body);
    await app.notifications.unregisterToken(request.user.sub, token);
    return reply.status(204).send();
  });
};

export default notificationsRoutes;
