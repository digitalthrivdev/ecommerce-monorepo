import { access } from "node:fs/promises";
import path from "node:path";

import { env } from "../../config/env.js";
import { ComplaintReason, ComplaintStatus, OrderStatus, Prisma, RefundMethod, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import type { Notification } from "../notifications/order-notifications.js";
import { deliveredAt, deliveredEntry, lockOrder } from "../orders/order-status.js";
import { complaintDeadline } from "../orders/orders.service.js";
import type { PaymentsService } from "../payments/payments.service.js";
import type { ComplaintRefundInput, CreateComplaintInput, ListComplaintsQuery, OrderRefundInput, ResolveComplaintInput } from "./complaints.schemas.js";

type Tx = Prisma.TransactionClient;

export const REASON_LABELS: Record<ComplaintReason, string> = {
  DAMAGED: "Damaged item",
  WRONG_ITEM: "Wrong item",
  MISSING: "Missing item",
  EXPIRED: "Expired or poor quality",
  OTHER: "Other problem",
};

/** Paths the image store writes, e.g. `images/3f/3f9c….webp`. */
const UPLOAD_KEY_PATTERN = /^images\/[0-9a-f]{2}\/[0-9a-f]{32}\.webp$/;

function money(amount: Prisma.Decimal) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: env.CURRENCY }).format(amount.toNumber());
}

const notFound = () => new AppError(404, "COMPLAINT_NOT_FOUND", "Complaint not found");

export function createComplaintsService(
  prisma: PrismaClient,
  payments: PaymentsService,
  notify: (notifications: Notification[]) => Promise<void>,
  uploadsRoot: string,
) {
  /** The customer's delivered order, if a problem can still be reported on it. */
  async function reportableOrder(db: PrismaClient | Tx, userId: string, orderId: string) {
    const order = await db.order.findFirst({
      where: { id: orderId, userId },
      select: {
        id: true,
        status: true,
        items: { select: { id: true, quantity: true, unavailableQuantity: true } },
        statusHistory: deliveredEntry,
        complaint: { select: { id: true } },
      },
    });

    if (!order) {
      throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
    }
    if (order.status !== OrderStatus.DELIVERED) {
      throw new AppError(409, "ORDER_NOT_DELIVERED", "You can report a problem once the order is delivered");
    }
    if (order.complaint) {
      throw new AppError(409, "COMPLAINT_EXISTS", "You've already reported a problem with this order");
    }
    const deadline = complaintDeadline(deliveredAt(order.statusHistory));
    if (!deadline || deadline <= new Date()) {
      throw new AppError(409, "COMPLAINT_WINDOW_CLOSED", "Problems can be reported up to 24 hours after delivery. Contact support for help.");
    }
    return order;
  }

  async function assertCanReport(userId: string, orderId: string) {
    await reportableOrder(prisma, userId, orderId);
  }

  /** Photos must be images uploaded to this server for the complaint. */
  async function checkPhotos(photoUrls: string[], uploadsBaseUrl: string) {
    for (const url of photoUrls) {
      const key = url.startsWith(uploadsBaseUrl) ? url.slice(uploadsBaseUrl.length) : "";
      const exists = UPLOAD_KEY_PATTERN.test(key) && (await access(path.join(uploadsRoot, key)).then(() => true, () => false));
      if (!exists) {
        throw new AppError(400, "INVALID_PHOTO", "Upload the photos again and retry");
      }
    }
  }

  async function createComplaint(userId: string, orderId: string, input: CreateComplaintInput, uploadsBaseUrl: string) {
    await checkPhotos(input.photoUrls, uploadsBaseUrl);

    try {
      await prisma.$transaction(async (tx) => {
        await lockOrder(tx, orderId, { userId });
        const order = await reportableOrder(tx, userId, orderId);

        const itemsById = new Map(order.items.map((item) => [item.id, item]));
        for (const { orderItemId, quantity } of input.items) {
          const item = itemsById.get(orderItemId);
          if (!item) {
            throw new AppError(404, "ORDER_ITEM_NOT_FOUND", "Item not found in this order");
          }
          const delivered = item.quantity - item.unavailableQuantity;
          if (quantity > delivered) {
            throw new AppError(400, "INVALID_QUANTITY", `Only ${delivered} of this item ${delivered === 1 ? "was" : "were"} delivered`, {
              orderItemId,
              delivered,
            });
          }
        }

        await tx.complaint.create({
          data: {
            orderId,
            userId,
            reason: input.reason,
            note: input.note ?? null,
            photoUrls: input.photoUrls,
            items: { create: input.items },
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError(409, "COMPLAINT_EXISTS", "You've already reported a problem with this order");
      }
      throw error;
    }
  }

  async function listComplaints({ status, q, limit, offset }: ListComplaintsQuery) {
    const search: Prisma.ComplaintWhereInput = q
      ? {
          order: {
            OR: [
              { orderNumber: { contains: q, mode: "insensitive" } },
              { customerName: { contains: q, mode: "insensitive" } },
              { customerPhone: { contains: q } },
            ],
          },
        }
      : {};
    const where: Prisma.ComplaintWhereInput = { AND: [search, status ? { status } : {}] };

    const [rows, total, counts] = await prisma.$transaction([
      prisma.complaint.findMany({
        where,
        // Open complaints oldest first, so nobody waits longest; the rest newest first.
        orderBy: status === ComplaintStatus.OPEN ? { createdAt: "asc" } : { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          reason: true,
          status: true,
          createdAt: true,
          resolvedAt: true,
          order: {
            select: {
              id: true,
              orderNumber: true,
              paymentMethod: true,
              total: true,
              customerName: true,
              customerPhone: true,
            },
          },
          _count: { select: { items: true } },
          refunds: { select: { amount: true } },
        },
      }),
      prisma.complaint.count({ where }),
      prisma.complaint.groupBy({ by: ["status"], where: search, orderBy: { status: "asc" }, _count: { _all: true } }),
    ]);

    return {
      items: rows.map(({ refunds, order, _count, ...complaint }) => ({
        ...complaint,
        itemCount: _count.items,
        refunded: refunds.reduce((sum, refund) => sum.plus(refund.amount), new Prisma.Decimal(0)).toFixed(2),
        order: { ...order, total: order.total.toFixed(2) },
      })),
      total,
      limit,
      offset,
      statusCounts: Object.fromEntries(counts.map((row) => [row.status, row._count._all])) as Partial<Record<ComplaintStatus, number>>,
    };
  }

  async function getComplaint(id: string) {
    const complaint = await prisma.complaint.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        reason: true,
        note: true,
        photoUrls: true,
        status: true,
        resolutionNote: true,
        createdAt: true,
        resolvedAt: true,
        resolvedBy: { select: { name: true } },
        items: {
          select: {
            quantity: true,
            orderItem: {
              select: { id: true, productName: true, variantName: true, sku: true, imageUrl: true, unitPrice: true, quantity: true, unavailableQuantity: true },
            },
          },
        },
        refunds: {
          orderBy: { createdAt: "asc" },
          select: { id: true, amount: true, method: true, reference: true, reason: true, createdAt: true, createdBy: { select: { name: true } } },
        },
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            paymentMethod: true,
            total: true,
            customerName: true,
            customerPhone: true,
            createdAt: true,
            statusHistory: deliveredEntry,
            payment: { select: { status: true, amount: true, refundedAmount: true } },
          },
        },
      },
    });

    if (!complaint) {
      throw notFound();
    }

    const { userId, order, items, refunds, resolvedBy, ...rest } = complaint;
    const [customer, complaintCount] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, phone: true, deletedAt: true } }),
      prisma.complaint.count({ where: { userId } }),
    ]);

    const refundable = payments.refundableAmount(order, order.payment);
    const reportedValue = items.reduce((sum, item) => sum.plus(item.orderItem.unitPrice.mul(item.quantity)), new Prisma.Decimal(0));

    return {
      ...rest,
      reasonLabel: REASON_LABELS[rest.reason],
      resolvedBy: resolvedBy?.name ?? null,
      customer: customer && { ...customer, complaintCount },
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentMethod: order.paymentMethod,
        total: order.total.toFixed(2),
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        createdAt: order.createdAt,
        deliveredAt: deliveredAt(order.statusHistory),
      },
      items: items.map(({ quantity, orderItem }) => ({
        orderItemId: orderItem.id,
        productName: orderItem.productName,
        variantName: orderItem.variantName,
        sku: orderItem.sku,
        imageUrl: orderItem.imageUrl,
        unitPrice: orderItem.unitPrice.toFixed(2),
        deliveredQuantity: orderItem.quantity - orderItem.unavailableQuantity,
        quantity,
        value: orderItem.unitPrice.mul(quantity).toFixed(2),
      })),
      refunds: refunds.map(({ amount, createdBy, ...refund }) => ({ ...refund, amount: amount.toFixed(2), createdBy: createdBy?.name ?? null })),
      refundable: refundable.toFixed(2),
      suggestedRefund: Prisma.Decimal.min(reportedValue, refundable).toFixed(2),
    };
  }

  /** Locks the order, then the complaint, and checks it is still open. */
  async function lockOpenComplaint(tx: Tx, id: string) {
    const ref = await tx.complaint.findUnique({ where: { id }, select: { orderId: true } });
    if (!ref) {
      throw notFound();
    }
    await lockOrder(tx, ref.orderId);
    const [complaint] = await tx.$queryRaw<{ status: ComplaintStatus; userId: string }[]>`
      SELECT status, "userId" FROM "Complaint" WHERE id = ${id} FOR UPDATE
    `;
    if (complaint!.status !== ComplaintStatus.OPEN) {
      throw new AppError(409, "COMPLAINT_CLOSED", "This complaint has already been answered", { status: complaint!.status });
    }
    return { orderId: ref.orderId, userId: complaint!.userId };
  }

  async function orderNumberOf(orderId: string) {
    return (await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { orderNumber: true } })).orderNumber;
  }

  function refundMessage(amount: Prisma.Decimal, method: RefundMethod) {
    return method === RefundMethod.GATEWAY
      ? `${money(amount)} is on its way back to your original payment method and usually arrives in 5 to 7 working days.`
      : `${money(amount)} has been sent to you by ${method === RefundMethod.UPI ? "UPI" : "bank transfer"}.`;
  }

  async function refundComplaint(id: string, input: ComplaintRefundInput, adminId: string) {
    const amount = new Prisma.Decimal(input.amount);
    const { orderId, userId, refund } = await prisma.$transaction(
      async (tx) => {
        const { orderId, userId } = await lockOpenComplaint(tx, id);
        const refund = await payments.refundDeliveredOrder(tx, {
          orderId,
          amount,
          method: input.method,
          reference: input.reference,
          reason: input.note,
          complaintId: id,
          createdById: adminId,
        });
        await tx.complaint.update({
          where: { id },
          data: { status: ComplaintStatus.RESOLVED, resolutionNote: input.note, resolvedById: adminId, resolvedAt: new Date() },
        });
        return { orderId, userId, refund };
      },
      { timeout: 20_000 },
    );

    const orderNumber = await orderNumberOf(orderId);
    await notify([
      {
        userId,
        title: "Refund issued",
        body: `Order ${orderNumber}: ${refundMessage(amount, refund.method)} ${input.note}`,
        data: { type: "complaint", orderId },
      },
    ]);
    return getComplaint(id);
  }

  async function resolveComplaint(id: string, input: ResolveComplaintInput, adminId: string) {
    const { orderId, userId } = await prisma.$transaction(async (tx) => {
      const locked = await lockOpenComplaint(tx, id);
      await tx.complaint.update({
        where: { id },
        data: { status: input.status, resolutionNote: input.note, resolvedById: adminId, resolvedAt: new Date() },
      });
      return locked;
    });

    const orderNumber = await orderNumberOf(orderId);
    await notify([
      {
        userId,
        title: "We've looked into your report",
        body: `Order ${orderNumber}: ${input.note}`,
        data: { type: "complaint", orderId },
      },
    ]);
    return getComplaint(id);
  }

  /** A refund on a delivered order without a complaint, e.g. after the customer phoned. */
  async function refundOrder(orderId: string, input: OrderRefundInput, adminId: string) {
    const amount = new Prisma.Decimal(input.amount);
    const refund = await prisma.$transaction(
      (tx) =>
        payments.refundDeliveredOrder(tx, {
          orderId,
          amount,
          method: input.method,
          reference: input.reference,
          reason: input.reason,
          createdById: adminId,
        }),
      { timeout: 20_000 },
    );

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { userId: true, orderNumber: true } });
    await notify([
      {
        userId: order.userId,
        title: "Refund issued",
        body: `Order ${order.orderNumber}: ${refundMessage(amount, refund.method)}`,
        data: { type: "complaint", orderId },
      },
    ]);
    return { ...refund, amount: refund.amount.toFixed(2) };
  }

  return { assertCanReport, createComplaint, listComplaints, getComplaint, refundComplaint, resolveComplaint, refundOrder };
}

export type ComplaintsService = ReturnType<typeof createComplaintsService>;
