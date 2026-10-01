import fp from "fastify-plugin";

import { env } from "../config/env.js";
import { createPaymentProvider } from "../modules/payments/payment-provider.js";
import { createPaymentsService } from "../modules/payments/payments.service.js";

export default fp(async (app) => {
  const payments = createPaymentsService(app.prisma, createPaymentProvider(), app.log);
  app.decorate("payments", payments);

  if (env.PAYMENT_SWEEP_INTERVAL_SECONDS === 0) {
    return;
  }

  let timer: NodeJS.Timeout | undefined;
  let running = false;

  app.addHook("onReady", async () => {
    timer = setInterval(async () => {
      if (running) return;
      running = true;
      try {
        const result = await payments.sweep();
        if (result.expired || result.refunded || result.refundsPending) {
          app.log.info(result, "Payment sweep");
        }
      } catch (error) {
        app.log.error({ err: error }, "Payment sweep failed");
      } finally {
        running = false;
      }
    }, env.PAYMENT_SWEEP_INTERVAL_SECONDS * 1000);
    timer.unref();
  });

  app.addHook("onClose", async () => {
    clearInterval(timer);
  });
});
