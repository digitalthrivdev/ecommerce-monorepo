import { randomUUID } from "node:crypto";

import type { FastifyPluginAsync } from "fastify";

import { PaymentMethod, UserRole } from "../../generated/prisma/client";
import { idParamsSchema } from "../../shared/schemas.js";
import { sendPdf } from "../invoices/invoices.routes.js";
import { createInvoicesService } from "../invoices/invoices.service.js";
import { startPaymentBodySchema } from "../payments/payments.schemas.js";
import { createDiscoveryService } from "../products/discovery.service.js";
import { buyAgainQuerySchema } from "../products/products.schemas.js";
import { publicBaseUrl } from "../payments/public-url.js";
import {
  cancelOrderBodySchema,
  createOrderBodySchema,
  directOrderBodySchema,
  listOrdersQuerySchema,
} from "./orders.schemas.js";
import { createOrdersService } from "./orders.service.js";

const ordersRoutes: FastifyPluginAsync = async (app) => {
  const ordersService = createOrdersService(app.prisma, app.payments);
  const discovery = createDiscoveryService(app.prisma);
  const invoices = createInvoicesService(app.prisma);

  app.post("/direct", async (request, reply) => {
    const isAuthed = await app.tryAuthenticate(request);
    const body = directOrderBodySchema.parse(request.body);
    const { order, user } = await ordersService.directOrder(isAuthed ? request.user.sub : null, body);

    const accessToken = app.jwt.sign({
      sub: user.id,
      role: user.role,
      ...(user.isTestAccount && { test: true as const }),
      jti: randomUUID(),
    });

    let payment: Awaited<ReturnType<typeof app.payments.startPayment>> | null = null;
    if (body.paymentMethod === PaymentMethod.ONLINE) {
      payment = await app.payments.startPayment(user.id, order.id, {
        appReturnUrl: body.returnUrl ?? `${publicBaseUrl(request)}/orders/${order.id}`,
        baseUrl: publicBaseUrl(request),
      });
    }

    return reply.status(201).send({
      order,
      accessToken,
      user: { id: user.id, name: user.name, phone: user.phone },
      payment,
    });
  });

  await app.register(async (authed) => {
    authed.addHook("preHandler", authed.requireRole(UserRole.CUSTOMER));

    authed.post("/", async (request, reply) => {
      const body = createOrderBodySchema.parse(request.body);
      const order = await ordersService.createOrder(request.user.sub, body);
      return reply.status(201).send(order);
    });

    authed.get("/", async (request) => {
      const query = listOrdersQuerySchema.parse(request.query);
      return ordersService.listOrders(request.user.sub, query);
    });

    authed.get("/buy-again", async (request) => {
      const { limit } = buyAgainQuerySchema.parse(request.query);
      return discovery.buyAgain(request.user.sub, limit);
    });

    authed.get("/:id", async (request) => {
      const { id } = idParamsSchema.parse(request.params);
      return ordersService.getOrder(request.user.sub, id);
    });

    authed.get("/:id/invoice", async (request, reply) => {
      const { id } = idParamsSchema.parse(request.params);
      return sendPdf(reply, await invoices.forCustomer(request.user.sub, id), "attachment");
    });

    /** For the app: a link the phone's browser can open without the access token. */
    authed.post("/:id/invoice-link", async (request) => {
      const { id } = idParamsSchema.parse(request.params);
      return invoices.customerLink(request.user.sub, id, publicBaseUrl(request));
    });

    authed.post("/:id/cancel", async (request) => {
      const { id } = idParamsSchema.parse(request.params);
      const { reason } = cancelOrderBodySchema.parse(request.body ?? undefined);
      return ordersService.cancelOrder(request.user.sub, id, reason);
    });

    authed.post("/:id/payment", async (request) => {
      const { id } = idParamsSchema.parse(request.params);
      const { returnUrl } = startPaymentBodySchema.parse(request.body);
      return app.payments.startPayment(request.user.sub, id, {
        appReturnUrl: returnUrl,
        baseUrl: publicBaseUrl(request),
      });
    });
  });
};

export default ordersRoutes;
