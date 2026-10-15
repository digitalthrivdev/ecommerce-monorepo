import { access } from "node:fs/promises";
import path from "node:path";

import { env } from "../../config/env.js";
import { ComplaintReason, ComplaintStatus, InventoryAdjustmentReason, OrderStatus, PaymentMethod, PaymentStatus, Prisma, RefundMethod, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import type { Notification } from "../notifications/order-notifications.js";
import { deliveredAt, deliveredEntry, lockOrder } from "../orders/order-status.js";
import { getPlatformSettings } from "../settings/settings.service.js";
import { getShippingProvider } from "../shipping/carrier-registry.js";
import { defaultPickupLocation } from "../shipping/pickup-locations.service.js";
import { complaintDeadline } from "../orders/orders.service.js";
import type { PaymentsService } from "../payments/payments.service.js";
import type { CreateComplaintInput, ListComplaintsQuery, OrderRefundInput, ResolveComplaintInput } from "./complaints.schemas.js";

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
      throw new AppError(409, "RETURN_EXISTS", "A return request already exists for this order");
    }
    const deadline = complaintDeadline(deliveredAt(order.statusHistory));
    const returnWindowDays = (await getPlatformSettings(db)).returnWindowDays;
    const returnDeadline = deliveredAt(order.statusHistory)
      ? new Date(deliveredAt(order.statusHistory)!.getTime() + returnWindowDays * 24 * 60 * 60 * 1000)
      : deadline;
    if (!returnDeadline || returnDeadline <= new Date()) {
      throw new AppError(409, "RETURN_WINDOW_CLOSED", `Returns can be requested within ${returnWindowDays} days after delivery.`);
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
        reverseCourierName: true,
        reverseAwb: true,
        reverseTrackingUrl: true,
        resolvedBy: { select: { name: true } },
        items: {
          select: {
            quantity: true,
            orderItem: {
              select: { id: true, productName: true, variantName: true, sku: true, imageUrl: true, unitPrice: true, quantity: true, unavailableQuantity: true, discount: true },
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
            shipment: { select: { provider: true, weightGrams: true, lengthCm: true, breadthCm: true, heightCm: true } },
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
    const reportedValue = items.reduce((sum, item) => {
      const charged = item.orderItem.quantity - item.orderItem.unavailableQuantity;
      const discount = charged > 0 ? item.orderItem.discount.mul(item.quantity).div(charged) : new Prisma.Decimal(0);
      return sum.plus(item.orderItem.unitPrice.mul(item.quantity).minus(discount));
    }, new Prisma.Decimal(0));

    return {
      ...rest,
      canBookReversePickup: order.shipment?.provider === "shiprocket",
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
        title: input.status === ComplaintStatus.APPROVED ? "Return approved" : "Return request update",
        body: `Order ${orderNumber}: ${input.note}`,
        data: { type: "complaint", orderId },
      },
    ]);
    return getComplaint(id);
  }

  async function setReversePickup(id: string, input: { courierName: string; awb: string; trackingUrl?: string | null }) {
    const current = await prisma.complaint.findUnique({ where: { id }, select: { status: true, reverseProviderOrderId: true } });
    if (!current) throw notFound();
    if (current.status !== ComplaintStatus.APPROVED) throw new AppError(409, "RETURN_NOT_APPROVED", "Approve the return before adding pickup details");
    if (current.reverseProviderOrderId) throw new AppError(409, "RETURN_PICKUP_ALREADY_BOOKED", "A carrier reverse pickup has already been booked");
    await prisma.complaint.update({ where: { id }, data: { reverseCourierName: input.courierName, reverseAwb: input.awb, reverseTrackingUrl: input.trackingUrl ?? null } });
    return getComplaint(id);
  }

  async function bookReversePickup(id: string, customerEmail: string) {
    const request = await prisma.complaint.findUnique({
      where: { id },
      include: {
        order: { include: { shipment: true } },
        items: { include: { orderItem: true } },
      },
    });
    if (!request) throw notFound();
    if (request.status !== ComplaintStatus.APPROVED) throw new AppError(409, "RETURN_NOT_APPROVED", "Approve the return before booking pickup");
    if (request.reverseAwb || request.reverseProviderOrderId) throw new AppError(409, "RETURN_PICKUP_ALREADY_BOOKED", "A reverse pickup has already been recorded");
    if (!request.order.shipment) throw new AppError(409, "SHIPMENT_NOT_FOUND", "This order has no original shipment. Enter manual pickup details instead.");
    const provider = await getShippingProvider(prisma, request.order.shipment.provider);
    if (!provider?.createReturnPickup) throw new AppError(409, "RETURN_PICKUP_UNSUPPORTED", "This carrier does not support API booked reverse pickups. Enter the courier and AWB after arranging pickup manually.");
    const pickup = await defaultPickupLocation(prisma);
    if (!pickup) throw new AppError(409, "PICKUP_LOCATION_REQUIRED", "Add a default pickup location before booking a reverse pickup");

    await prisma.$transaction(async (tx) => {
      await lockOrder(tx, request.orderId);
      const [row] = await tx.$queryRaw<{ status: ComplaintStatus; reverseAwb: string | null; reverseProviderOrderId: string | null }[]>`SELECT status, "reverseAwb", "reverseProviderOrderId" FROM "Complaint" WHERE id = ${id} FOR UPDATE`;
      if (row?.status !== ComplaintStatus.APPROVED) throw new AppError(409, "RETURN_NOT_APPROVED", "Approve the return before booking pickup");
      if (row.reverseAwb || row.reverseProviderOrderId) throw new AppError(409, "RETURN_PICKUP_ALREADY_BOOKED", "A reverse pickup has already been recorded");
      await tx.complaint.update({ where: { id }, data: { reverseProvider: provider.name, reverseProviderOrderId: "BOOKING" } });
    });

    let booked: Awaited<ReturnType<NonNullable<typeof provider.createReturnPickup>>>;
    try {
      booked = await provider.createReturnPickup({
        orderNumber: request.order.orderNumber,
        orderDate: request.order.createdAt,
        pickup: {
          name: request.order.customerName,
          phone: request.order.customerPhone,
          addressLine1: request.order.addressLine1,
          addressLine2: request.order.addressLine2,
          landmark: request.order.landmark,
          city: request.order.city,
          state: request.order.state,
          postalCode: request.order.postalCode,
          email: customerEmail,
        },
        delivery: {
          name: pickup.contactName,
          phone: pickup.phone,
          addressLine1: pickup.addressLine1,
          addressLine2: pickup.addressLine2,
          landmark: pickup.landmark,
          city: pickup.city,
          state: pickup.state,
          postalCode: pickup.postalCode,
        },
        items: request.items.map(({ quantity, orderItem }) => {
          const delivered = orderItem.quantity - orderItem.unavailableQuantity;
          const discountPerUnit = delivered > 0 ? orderItem.discount.div(delivered) : new Prisma.Decimal(0);
          return {
            name: orderItem.variantName ? `${orderItem.productName} (${orderItem.variantName})` : orderItem.productName,
            sku: orderItem.sku,
            quantity,
            unitPrice: Prisma.Decimal.max(new Prisma.Decimal(0), orderItem.unitPrice.minus(discountPerUnit)),
          };
        }),
        parcel: {
          weightGrams: request.order.shipment.weightGrams,
          lengthCm: request.order.shipment.lengthCm,
          breadthCm: request.order.shipment.breadthCm,
          heightCm: request.order.shipment.heightCm,
        },
      });
    } catch (error) {
      await prisma.complaint.updateMany({ where: { id, reverseProviderOrderId: "BOOKING" }, data: { reverseProvider: null, reverseProviderOrderId: null } });
      throw error;
    }

    await prisma.complaint.update({
      where: { id },
      data: {
        reverseProvider: provider.name,
        reverseProviderOrderId: booked.providerOrderId,
        reverseProviderShipmentId: booked.providerShipmentId,
        reverseAwb: booked.awb,
        reverseCourierName: booked.courierName,
        reverseTrackingUrl: booked.trackingUrl,
      },
    });
    return getComplaint(id);
  }

  async function receiveReturn(id: string, input: { amount: string; method?: RefundMethod; reference?: string; note: string }, adminId: string) {
    const amount = new Prisma.Decimal(input.amount);
    const ref = await prisma.complaint.findUnique({ where: { id }, select: { orderId: true, userId: true } });
    if (!ref) throw notFound();
    const refund = await prisma.$transaction(async (tx) => {
      await lockOrder(tx, ref.orderId);
      const [row] = await tx.$queryRaw<{ status: ComplaintStatus }[]>`SELECT status FROM "Complaint" WHERE id = ${id} FOR UPDATE`;
      if (row?.status !== ComplaintStatus.APPROVED) throw new AppError(409, "RETURN_NOT_APPROVED", "Only an approved return can be received");
      const items = await tx.complaintItem.findMany({
        where: { complaintId: id },
        include: { orderItem: { select: { id: true, variantId: true, quantity: true, unavailableQuantity: true, unitPrice: true, discount: true } } },
      });
      const returnValue = items.reduce((sum, item) => {
        const charged = item.orderItem.quantity - item.orderItem.unavailableQuantity;
        const itemDiscount = charged > 0 ? item.orderItem.discount.mul(item.quantity).div(charged) : new Prisma.Decimal(0);
        return sum.plus(item.orderItem.unitPrice.mul(item.quantity).minus(itemDiscount));
      }, new Prisma.Decimal(0));
      if (amount.gt(returnValue)) {
        throw new AppError(400, "REFUND_TOO_LARGE", `The returned items were paid for with ${returnValue.toFixed(2)} at most`, { refundable: returnValue.toFixed(2) });
      }
      for (const item of items) {
        await tx.inventory.upsert({ where: { variantId: item.orderItem.variantId }, create: { variantId: item.orderItem.variantId, quantity: item.quantity }, update: { quantity: { increment: item.quantity } } });
        const [stock] = await tx.$queryRaw<{ quantity: number }[]>`SELECT quantity FROM "Inventory" WHERE "variantId" = ${item.orderItem.variantId} FOR UPDATE`;
        await tx.inventoryAdjustment.create({ data: { variantId: item.orderItem.variantId, delta: item.quantity, quantityAfter: stock!.quantity, reason: InventoryAdjustmentReason.RESTOCK, note: `Return received for order ${ref.orderId}`, changedById: adminId } });
      }
      const savedRefund = await payments.refundDeliveredOrder(tx, { orderId: ref.orderId, amount, method: input.method, reference: input.reference, reason: input.note, complaintId: id, createdById: adminId });
      await tx.complaint.update({ where: { id }, data: { status: ComplaintStatus.RESOLVED, resolutionNote: input.note, resolvedById: adminId, resolvedAt: new Date() } });
      return savedRefund;
    }, { timeout: 20_000 });
    const orderNumber = await orderNumberOf(ref.orderId);
    await notify([{ userId: ref.userId, title: "Return received and refund issued", body: `Order ${orderNumber}: ${refundMessage(amount, refund.method)} ${input.note}`, data: { type: "complaint", orderId: ref.orderId } }]);
    return getComplaint(id);
  }

  async function confirmRtoReceived(orderId: string, adminId: string) {
    await prisma.$transaction(async (tx) => {
      await lockOrder(tx, orderId);
      const order = await tx.order.findUnique({ where: { id: orderId }, select: { status: true, rtoReceivedAt: true, orderNumber: true, paymentMethod: true } });
      if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
      if (order.status !== OrderStatus.RTO) throw new AppError(409, "ORDER_NOT_RTO", "Only RTO orders can be received");
      if (order.rtoReceivedAt) throw new AppError(409, "RTO_ALREADY_RECEIVED", "RTO receipt was already confirmed");
      const items = await tx.orderItem.findMany({ where: { orderId }, select: { variantId: true, quantity: true, unavailableQuantity: true } });
      for (const item of items) {
        const quantity = item.quantity - item.unavailableQuantity;
        if (!quantity) continue;
        await tx.inventory.upsert({ where: { variantId: item.variantId }, create: { variantId: item.variantId, quantity }, update: { quantity: { increment: quantity } } });
        const [stock] = await tx.$queryRaw<{ quantity: number }[]>`SELECT quantity FROM "Inventory" WHERE "variantId" = ${item.variantId} FOR UPDATE`;
        await tx.inventoryAdjustment.create({ data: { variantId: item.variantId, delta: quantity, quantityAfter: stock!.quantity, reason: InventoryAdjustmentReason.RESTOCK, note: `RTO received for order ${order.orderNumber}`, changedById: adminId } });
      }
      await tx.order.update({ where: { id: orderId }, data: { rtoReceivedAt: new Date() } });
      if (order.paymentMethod === PaymentMethod.ONLINE) {
        const payment = await tx.payment.findUnique({ where: { orderId }, select: { status: true, amount: true, refundedAmount: true } });
        if (payment?.status === PaymentStatus.PAID) {
          const amount = payment.amount.minus(payment.refundedAmount);
          if (amount.gt(0)) await payments.refundDeliveredOrder(tx, { orderId, amount, method: RefundMethod.GATEWAY, reason: "RTO parcel received", createdById: adminId });
        }
      }
    }, { timeout: 20_000 });
    return { ok: true };
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

  return { assertCanReport, createComplaint, listComplaints, getComplaint, resolveComplaint, setReversePickup, bookReversePickup, receiveReturn, confirmRtoReceived, refundOrder };
}

export type ComplaintsService = ReturnType<typeof createComplaintsService>;
