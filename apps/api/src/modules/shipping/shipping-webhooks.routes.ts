import type { FastifyPluginAsync } from "fastify";

import { carrierParamsSchema } from "./shipments.schemas.js";
import { createShipmentsService } from "./shipments.service.js";

const shippingWebhooksRoutes: FastifyPluginAsync = async (app) => {
  const shipments = createShipmentsService(app.prisma, app.log);

  // Webhook signatures are computed over the exact bytes received, so keep the body as a string.
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_request, body, done) => {
    done(null, body);
  });

  app.post("/webhooks/:carrier", async (request) => {
    const { carrier } = carrierParamsSchema.parse(request.params);
    const rawBody = typeof request.body === "string" ? request.body : "";
    await shipments.handleWebhook(carrier, rawBody, request.headers);
    return { received: true };
  });
};

export default shippingWebhooksRoutes;
