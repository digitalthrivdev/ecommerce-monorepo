import { OrderStatus, type Prisma, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { buildInvoice, invoiceFileName, invoiceSelect } from "./invoice.js";
import { INVOICE_LINK_TTL_MS, createInvoiceToken, readInvoiceToken } from "./invoice-link.js";
import { renderInvoicePdf } from "./invoice-pdf.js";

/** Customers don't get the invoice of an order cancelled after packing; the dashboard keeps it for the records. */
function assertInvoiced(order: { status: OrderStatus; invoiceNumber: string | null } | null, forCustomer: boolean) {
  if (!order) {
    throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
  }
  if (forCustomer && order.status === OrderStatus.CANCELLED) {
    throw new AppError(409, "ORDER_CANCELLED", "This order was cancelled, so it has no invoice");
  }
  if (!order.invoiceNumber) {
    throw new AppError(409, "INVOICE_NOT_READY", "The invoice is available once the order is packed", { status: order.status });
  }
}

export function createInvoicesService(prisma: PrismaClient) {
  async function invoicePdf(where: Prisma.OrderWhereInput, forCustomer: boolean) {
    const order = await prisma.order.findFirst({ where, select: invoiceSelect });
    assertInvoiced(order, forCustomer);
    return { fileName: invoiceFileName(order!.invoiceNumber!), pdf: await renderInvoicePdf(buildInvoice(order!)) };
  }

  /** The customer's own order, once packed. */
  function forCustomer(userId: string, orderId: string) {
    return invoicePdf({ id: orderId, userId }, true);
  }

  /** Admins and staff: any order. */
  function forDashboard(orderId: string) {
    return invoicePdf({ id: orderId }, false);
  }

  /** A short-lived link to the customer's invoice that works without the app's access token. */
  async function customerLink(userId: string, orderId: string, baseUrl: string) {
    assertInvoiced(await prisma.order.findFirst({ where: { id: orderId, userId }, select: { status: true, invoiceNumber: true } }), true);
    const expiresAt = new Date(Date.now() + INVOICE_LINK_TTL_MS);
    return { url: `${baseUrl}/invoices/${createInvoiceToken(orderId, expiresAt)}`, expiresAt };
  }

  /** Null when the link is forged or expired. */
  async function fromLink(token: string) {
    const orderId = readInvoiceToken(token);
    return orderId ? invoicePdf({ id: orderId }, true) : null;
  }

  return { forCustomer, forDashboard, customerLink, fromLink };
}

export type InvoicesService = ReturnType<typeof createInvoicesService>;
