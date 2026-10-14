import { OrderStatus, type Prisma, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { buildInvoice, invoiceFileName, invoiceSelect } from "./invoice.js";
import { INVOICE_LINK_TTL_MS, createInvoiceToken, readInvoiceToken } from "./invoice-link.js";
import { renderInvoicePdf } from "./invoice-pdf.js";

function assertInvoiced(order: { status: OrderStatus; invoiceNumber: string | null } | null) {
  if (!order) {
    throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
  }
  if (order.status !== OrderStatus.DELIVERED) {
    throw new AppError(409, "INVOICE_NOT_READY", "The invoice is available once the order is delivered", { status: order.status });
  }
  if (!order.invoiceNumber) {
    throw new AppError(409, "NO_INVOICE", "This order was delivered before invoices were numbered, so it has no invoice");
  }
}

export function createInvoicesService(prisma: PrismaClient) {
  async function invoicePdf(where: Prisma.OrderWhereInput) {
    const order = await prisma.order.findFirst({ where, select: invoiceSelect });
    assertInvoiced(order);
    return { fileName: invoiceFileName(order!.invoiceNumber!), pdf: await renderInvoicePdf(buildInvoice(order!)) };
  }

  /** The customer's own delivered order. */
  function forCustomer(userId: string, orderId: string) {
    return invoicePdf({ id: orderId, userId });
  }

  /** Admins and staff: any order. */
  function forDashboard(orderId: string) {
    return invoicePdf({ id: orderId });
  }

  /** A short-lived link to the customer's invoice that works without the app's access token. */
  async function customerLink(userId: string, orderId: string, baseUrl: string) {
    assertInvoiced(await prisma.order.findFirst({ where: { id: orderId, userId }, select: { status: true, invoiceNumber: true } }));
    const expiresAt = new Date(Date.now() + INVOICE_LINK_TTL_MS);
    return { url: `${baseUrl}/invoices/${createInvoiceToken(orderId, expiresAt)}`, expiresAt };
  }

  /** Null when the link is forged or expired. */
  async function fromLink(token: string) {
    const orderId = readInvoiceToken(token);
    return orderId ? invoicePdf({ id: orderId }) : null;
  }

  return { forCustomer, forDashboard, customerLink, fromLink };
}

export type InvoicesService = ReturnType<typeof createInvoicesService>;
