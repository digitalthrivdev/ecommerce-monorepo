import fp from "fastify-plugin";

import { env } from "../config/env.js";
import { createNotificationsService } from "../modules/notifications/notifications.service.js";
import { createPushSender } from "../modules/notifications/push-sender.js";

export default fp(async (app) => {
  const notifications = createNotificationsService(app.prisma, createPushSender(app.log), app.log);
  app.decorate("notifications", notifications);

  if (env.NOTIFICATION_INTERVAL_SECONDS === 0) {
    return;
  }

  let timer: NodeJS.Timeout | undefined;
  let running = false;

  app.addHook("onReady", async () => {
    timer = setInterval(async () => {
      if (running) return;
      running = true;
      try {
        const result = await notifications.processPending();
        if (result.sent) {
          app.log.debug(result, "Order notifications");
        }
      } catch (error) {
        app.log.error({ err: error }, "Order notifications failed");
      } finally {
        running = false;
      }
    }, env.NOTIFICATION_INTERVAL_SECONDS * 1000);
    timer.unref();
  });

  app.addHook("onClose", async () => {
    clearInterval(timer);
  });
});
