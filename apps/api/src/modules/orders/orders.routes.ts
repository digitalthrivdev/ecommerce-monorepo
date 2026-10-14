import type { FastifyPluginAsync } from "fastify";

import { UserRole } from "../../generated/prisma/client";
import { idParamsSchema } from "../../shared/schemas.js";
import { sendPdf } from "../invoices/invoices.routes.js";
import { createInvoicesService } from "../invoices/invoices.service.js";
import { startPaymentBodySchema } from "../payments/payments.schemas.js";
import { createDiscoveryService } from "../products/discovery.service.js";
import { buyAgainQuerySchema } from "../products/products.schemas.js";
import { publicBaseUrl } from "../payments/public-url.js";
import { cancelOrderBodySchema, createOrderBodySchema, listOrdersQuerySchema } from "./orders.schemas.js";
import { createOrdersService } from "./orders.service.js";

const ordersRoutes: FastifyPluginAsync = async (app) => {
  const ordersService = createOrdersService(app.prisma, app.payments);
  const discovery = createDiscoveryService(app.prisma);
  const invoices = createInvoicesService(app.prisma);

  app.addHook("preHandler", app.requireRole(UserRole.CUSTOMER));

  app.post("/", async (request, reply) => {
    const body = createOrderBodySchema.parse(request.body);
    const order = await ordersService.createOrder(request.user.sub, body);
    return reply.status(201).send(order);
  });

  app.get("/", async (request) => {
    const query = listOrdersQuerySchema.parse(request.query);
    return ordersService.listOrders(request.user.sub, query);
  });

  app.get("/buy-again", async (request) => {
    const { storeId, limit } = buyAgainQuerySchema.parse(request.query);
    return discovery.buyAgain(request.user.sub, storeId, limit);
  });

  app.get("/:id", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return ordersService.getOrder(request.user.sub, id);
  });

  app.get("/:id/invoice", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    return sendPdf(reply, await invoices.forCustomer(request.user.sub, id), "attachment");
  });

  /** For the app: a link the phone's browser can open without the access token. */
  app.post("/:id/invoice-link", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return invoices.customerLink(request.user.sub, id, publicBaseUrl(request));
  });

  app.post("/:id/cancel", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const { reason } = cancelOrderBodySchema.parse(request.body ?? undefined);
    return ordersService.cancelOrder(request.user.sub, id, reason);
  });

  app.post("/:id/payment", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const { returnUrl } = startPaymentBodySchema.parse(request.body);
    return app.payments.startPayment(request.user.sub, id, {
      appReturnUrl: returnUrl,
      baseUrl: publicBaseUrl(request),
    });
  });
};

export default ordersRoutes;
