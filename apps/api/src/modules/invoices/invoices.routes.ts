import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";

import { UserRole } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { paymentPage } from "../payments/gateway-helpers.js";
import { createInvoicesService } from "./invoices.service.js";

export function sendPdf(reply: FastifyReply, { fileName, pdf }: { fileName: string; pdf: Buffer }, disposition: "inline" | "attachment") {
  return reply
    .header("content-type", "application/pdf")
    .header("content-disposition", `${disposition}; filename="${fileName}"`)
    .header("cache-control", "private, no-store")
    .send(pdf);
}

const orderParamsSchema = z.object({ orderId: z.string().trim().min(1).max(64) });

/** `GET /admin/orders/:orderId/invoice` for the dashboard: admins, and staff for their own store. */
export const dashboardInvoiceRoutes: FastifyPluginAsync = async (app) => {
  const invoices = createInvoicesService(app.prisma);

  app.get("/:orderId/invoice", { preHandler: app.requireRole(UserRole.ADMIN, UserRole.STORE_STAFF) }, async (request, reply) => {
    const { orderId } = orderParamsSchema.parse(request.params);
    return sendPdf(reply, await invoices.forDashboard(request.user, orderId), "attachment");
  });
};

const tokenParamsSchema = z.object({ token: z.string().min(1).max(100) });

/** `GET /invoices/:token`: the customer's browser opens the signed link from the app. */
export const invoiceLinkRoutes: FastifyPluginAsync = async (app) => {
  const invoices = createInvoicesService(app.prisma);

  const page = (reply: FastifyReply, status: number, message: string) =>
    reply
      .status(status)
      .header("content-type", "text/html; charset=utf-8")
      .header("cache-control", "no-store")
      .send(paymentPage({ title: "Invoice", message }));

  app.get("/:token", async (request, reply) => {
    const parsed = tokenParamsSchema.safeParse(request.params);
    try {
      const invoice = parsed.success ? await invoices.fromLink(parsed.data.token) : null;
      if (!invoice) {
        return page(reply, 403, "This invoice link has expired. Open the invoice again from the app.");
      }
      return sendPdf(reply, invoice, "inline");
    } catch (error) {
      if (error instanceof AppError && error.statusCode < 500) {
        return page(reply, error.statusCode, error.message);
      }
      throw error;
    }
  });
};
