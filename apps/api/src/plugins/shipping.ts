import fp from "fastify-plugin";

import { env } from "../config/env.js";
import { createShipmentsService, type ShipmentsService } from "../modules/shipping/shipments.service.js";

declare module "fastify" {
  interface FastifyInstance {
    shipments: ShipmentsService;
  }
}

export default fp(async (app) => {
  const shipments = createShipmentsService(app.prisma, app.log);
  app.decorate("shipments", shipments);

  if (env.TRACKING_SYNC_INTERVAL_SECONDS === 0) {
    return;
  }

  let timer: NodeJS.Timeout | undefined;
  let running = false;

  app.addHook("onReady", async () => {
    timer = setInterval(async () => {
      if (running) return;
      running = true;
      try {
        const result = await shipments.sweepTracking();
        if (result.updated > 0) {
          app.log.info(result, "Shipment tracking sweep");
        }
      } catch (error) {
        app.log.error({ err: error }, "Shipment tracking sweep failed");
      } finally {
        running = false;
      }
    }, env.TRACKING_SYNC_INTERVAL_SECONDS * 1000);
    timer.unref();
  });

  app.addHook("onClose", async () => {
    clearInterval(timer);
  });
});
