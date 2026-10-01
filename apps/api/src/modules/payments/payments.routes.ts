import type { FastifyPluginAsync } from "fastify";

import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors.js";
import { mockCheckoutResult, mockFailedPaymentId } from "./mock-provider.js";
import { mockPayBodySchema, webhookParamsSchema } from "./payments.schemas.js";

const paymentsRoutes: FastifyPluginAsync = async (app) => {
  // Webhook signatures are computed over the exact bytes received, so keep the body as a string.
  await app.register(async (webhooks) => {
    webhooks.removeContentTypeParser("application/json");
    webhooks.addContentTypeParser("application/json", { parseAs: "string" }, (_request, body, done) => {
      done(null, body);
    });

    webhooks.post("/webhooks/:provider", async (request) => {
      const { provider } = webhookParamsSchema.parse(request.params);
      const rawBody = typeof request.body === "string" ? request.body : "";
      await app.payments.handleWebhook(provider, rawBody, request.headers);
      return { received: true };
    });
  });

  if (env.PAYMENT_PROVIDER !== "mock") {
    return;
  }

  // Stands in for the provider's hosted checkout during development.
  app.post("/mock/pay", async (request) => {
    const { providerOrderId, outcome } = mockPayBodySchema.parse(request.body);

    const payment = await app.prisma.payment.findUnique({ where: { providerOrderId }, select: { id: true } });
    if (!payment) {
      throw new AppError(404, "PAYMENT_NOT_FOUND", "Unknown provider order");
    }

    if (outcome === "success") {
      return mockCheckoutResult(providerOrderId);
    }

    const providerPaymentId = mockFailedPaymentId();
    await app.payments.handleEvent({
      type: "payment.failed",
      providerOrderId,
      providerPaymentId,
      reason: "Payment declined (mock)",
    });
    return { providerPaymentId, error: "Payment declined (mock)" };
  });
};

export default paymentsRoutes;
