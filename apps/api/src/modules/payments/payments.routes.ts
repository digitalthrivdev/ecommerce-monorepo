import type { FastifyPluginAsync, FastifyReply } from "fastify";

import { paymentPage } from "./gateway-helpers.js";
import type { BrowserResponse } from "./payments.service.js";
import { checkoutParamsSchema, returnParamsSchema, webhookParamsSchema } from "./payments.schemas.js";
import { publicBaseUrl } from "./public-url.js";

function stringParams(value: unknown) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

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

  // Pages opened in the customer's browser. They load gateway scripts, so Helmet's CSP is off here,
  // and errors are shown as a page rather than JSON.
  await app.register(async (pages) => {
    pages.addContentTypeParser(
      "application/x-www-form-urlencoded",
      { parseAs: "string", bodyLimit: 16_384 },
      (_request, body, done) => {
        done(null, Object.fromEntries(new URLSearchParams(body as string)));
      },
    );

    async function send(reply: FastifyReply, render: () => Promise<BrowserResponse>) {
      let response: BrowserResponse;
      try {
        response = await render();
      } catch (error) {
        reply.log.error({ err: error }, "Payment page failed");
        response = {
          status: 502,
          html: paymentPage({ title: "Something went wrong", message: "Return to the app and try again." }),
        };
      }

      reply
        .header("cache-control", "no-store")
        .header("referrer-policy", "no-referrer")
        .header("x-content-type-options", "nosniff");
      return reply.code(response.status).type("text/html; charset=utf-8").send(response.html);
    }

    pages.get("/checkout/:token", { helmet: false }, async (request, reply) => {
      const { token } = checkoutParamsSchema.parse(request.params);
      return send(reply, () => app.payments.renderCheckout(token, publicBaseUrl(request)));
    });

    // Gateways return the customer with a GET redirect or a form POST, depending on the gateway.
    pages.route({
      method: ["GET", "POST"],
      url: "/return/:provider/:token",
      helmet: false,
      handler: async (request, reply) => {
        const { provider, token } = returnParamsSchema.parse(request.params);
        const params = { ...stringParams(request.query), ...stringParams(request.body) };
        return send(reply, () => app.payments.handleReturn(provider, token, params));
      },
    });
  });
};

export default paymentsRoutes;
