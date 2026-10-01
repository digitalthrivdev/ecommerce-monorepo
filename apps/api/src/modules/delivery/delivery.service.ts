import type Redis from "ioredis";

import { env } from "../../config/env.js";
import {
  DeliveryPartnerStatus,
  DeliveryStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  type PrismaClient,
} from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { lockOrder, transitionOrder } from "../orders/order-status.js";
import { getPlatformSettings } from "../settings/settings.service.js";
import { deliveryOtp, hashDeliveryOtp, verifyDeliveryOtp } from "./delivery-otp.js";
import { ACTIVE_DELIVERY_STATUSES } from "./partners.service.js";

type Tx = Prisma.TransactionClient;

const OTP_MAX_ATTEMPTS = 5;
const OTP_LOCK_SECONDS = 15 * 60;

const otpAttemptsKey = (deliveryId: string) => `delivery:otp-attempts:${deliveryId}`;

const deliveryInclude = {
  order: {
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentMethod: true,
      total: true,
      customerName: true,
      customerPhone: true,
      addressLine1: true,
      addressLine2: true,
      landmark: true,
      city: true,
      postalCode: true,
      latitude: true,
      longitude: true,
      store: {
        select: {
          name: true,
          phone: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          latitude: true,
          longitude: true,
        },
      },
      items: { select: { productName: true, quantity: true }, orderBy: { createdAt: "asc" } },
    },
  },
} satisfies Prisma.DeliveryInclude;

type DeliveryRow = Prisma.DeliveryGetPayload<{ include: typeof deliveryInclude }>;

function partnerActions(orderStatus: OrderStatus, accepted: boolean) {
  switch (orderStatus) {
    case OrderStatus.ASSIGNED:
      return accepted ? ["pickup"] : ["accept", "decline"];
    case OrderStatus.PICKED_UP:
      return ["start-delivery"];
    case OrderStatus.OUT_FOR_DELIVERY:
      return ["delivered"];
    default:
      return [];
  }
}

function toPartnerView(delivery: DeliveryRow) {
  const { order } = delivery;
  const active = ACTIVE_DELIVERY_STATUSES.includes(delivery.status);

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    orderStatus: order.status,
    deliveryStatus: delivery.status,
    allowedActions: active ? partnerActions(order.status, delivery.acceptedAt !== null) : [],
    assignedAt: delivery.assignedAt,
    acceptedAt: delivery.acceptedAt,
    pickedUpAt: delivery.pickedUpAt,
    deliveredAt: delivery.deliveredAt,
    store: order.store,
    // Customer contact details are only shared while the delivery is in progress.
    customer: active
      ? {
          name: order.customerName,
          phone: order.customerPhone,
          addressLine1: order.addressLine1,
          addressLine2: order.addressLine2,
          landmark: order.landmark,
          city: order.city,
          postalCode: order.postalCode,
          latitude: order.latitude,
          longitude: order.longitude,
        }
      : { name: order.customerName, city: order.city },
    items: order.items,
    paymentMethod: order.paymentMethod,
    orderTotal: order.total.toFixed(2),
    cashToCollect: order.paymentMethod === PaymentMethod.COD ? order.total.toFixed(2) : "0.00",
    earning: delivery.earning?.toFixed(2) ?? null,
  };
}

async function freePartner(tx: Tx, partnerId: string) {
  await tx.deliveryPartner.updateMany({
    where: { id: partnerId, status: DeliveryPartnerStatus.BUSY },
    data: { status: DeliveryPartnerStatus.ONLINE },
  });
}

/** Locks partner rows in id order so concurrent reassignments cannot deadlock. */
async function lockPartners(tx: Tx, ids: string[]) {
  const sorted = [...new Set(ids)].sort();
  const rows = await tx.$queryRaw<{ id: string; status: DeliveryPartnerStatus; isActive: boolean; name: string | null }[]>`
    SELECT p.id, p.status, p."isActive", u.name
    FROM "DeliveryPartner" p JOIN "User" u ON u.id = p."userId"
    WHERE p.id IN (${Prisma.join(sorted)})
    ORDER BY p.id
    FOR UPDATE OF p
  `;
  return new Map(rows.map((row) => [row.id, row]));
}

function assertAvailable<T extends { status: DeliveryPartnerStatus; isActive: boolean }>(partner: T | undefined) {
  if (!partner) {
    throw new AppError(404, "PARTNER_NOT_FOUND", "Delivery partner not found");
  }
  if (!partner.isActive || partner.status !== DeliveryPartnerStatus.ONLINE) {
    throw new AppError(
      409,
      "PARTNER_UNAVAILABLE",
      partner.isActive ? `Delivery partner is ${partner.status}` : "Delivery partner is inactive",
      { status: partner.status, isActive: partner.isActive },
    );
  }
  return partner;
}

export function createDeliveryService(prisma: PrismaClient, redis: Redis) {
  async function resolvePartner(userId: string) {
    const partner = await prisma.deliveryPartner.findUnique({
      where: { userId },
      include: { user: { select: { name: true, phone: true } } },
    });

    if (!partner?.isActive) {
      throw new AppError(403, "PARTNER_INACTIVE", "Your delivery partner account is not active");
    }
    return partner;
  }

  async function getMe(userId: string) {
    const partner = await resolvePartner(userId);
    const active = await prisma.delivery.findFirst({
      where: { partnerId: partner.id, status: { in: ACTIVE_DELIVERY_STATUSES } },
      select: { orderId: true },
    });

    return {
      id: partner.id,
      name: partner.user.name,
      phone: partner.user.phone,
      status: partner.status,
      vehicleType: partner.vehicleType,
      vehicleNumber: partner.vehicleNumber,
      activeOrderId: active?.orderId ?? null,
    };
  }

  async function setStatus(userId: string, status: DeliveryPartnerStatus) {
    const partner = await resolvePartner(userId);

    await prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ status: DeliveryPartnerStatus }[]>`
        SELECT status FROM "DeliveryPartner" WHERE id = ${partner.id} FOR UPDATE
      `;
      if (locked!.status === DeliveryPartnerStatus.BUSY) {
        throw new AppError(409, "PARTNER_BUSY", "Finish your active delivery first");
      }
      await tx.deliveryPartner.update({ where: { id: partner.id }, data: { status } });
    });

    return getMe(userId);
  }

  async function findView(partnerId: string, orderId: string) {
    const row = await prisma.delivery.findFirst({ where: { orderId, partnerId }, include: deliveryInclude });

    if (!row) {
      throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
    }
    return toPartnerView(row);
  }

  async function listActive(userId: string) {
    const partner = await resolvePartner(userId);
    const rows = await prisma.delivery.findMany({
      where: { partnerId: partner.id, status: { in: ACTIVE_DELIVERY_STATUSES } },
      include: deliveryInclude,
      orderBy: { assignedAt: "asc" },
    });
    return { items: rows.map(toPartnerView) };
  }

  async function getDelivery(userId: string, orderId: string) {
    const partner = await resolvePartner(userId);
    return findView(partner.id, orderId);
  }

  async function lockOwnDelivery(tx: Tx, orderId: string, partnerId: string) {
    const order = await lockOrder(tx, orderId, { partnerId });
    const delivery = await tx.delivery.findUniqueOrThrow({ where: { orderId } });
    return { order, delivery };
  }

  async function accept(userId: string, orderId: string) {
    const partner = await resolvePartner(userId);

    await prisma.$transaction(async (tx) => {
      const { order, delivery } = await lockOwnDelivery(tx, orderId, partner.id);
      if (order.status !== OrderStatus.ASSIGNED) {
        throw new AppError(409, "INVALID_STATUS_TRANSITION", `Cannot accept an order that is ${order.status}`, {
          status: order.status,
        });
      }
      if (delivery.acceptedAt) {
        throw new AppError(409, "ALREADY_ACCEPTED", "You have already accepted this delivery");
      }
      await tx.delivery.update({ where: { id: delivery.id }, data: { acceptedAt: new Date() } });
    });

    return findView(partner.id, orderId);
  }

  async function decline(userId: string, orderId: string, reason?: string) {
    const partner = await resolvePartner(userId);

    await prisma.$transaction(async (tx) => {
      const { order, delivery } = await lockOwnDelivery(tx, orderId, partner.id);
      if (order.status === OrderStatus.ASSIGNED && delivery.acceptedAt) {
        throw new AppError(409, "ALREADY_ACCEPTED", "You accepted this delivery; ask an admin to reassign it");
      }

      await transitionOrder(tx, {
        orderId,
        scope: { partnerId: partner.id },
        allowedFrom: [OrderStatus.ASSIGNED],
        to: OrderStatus.READY_FOR_PICKUP,
        changedById: userId,
        note: reason ? `Declined by delivery partner: ${reason}` : "Declined by delivery partner",
      });
      await tx.delivery.update({
        where: { id: delivery.id },
        data: { status: DeliveryStatus.PENDING, partnerId: null, assignedAt: null, acceptedAt: null },
      });
      await freePartner(tx, partner.id);
    });

    return { orderId, declined: true };
  }

  async function pickup(userId: string, orderId: string) {
    const partner = await resolvePartner(userId);

    await prisma.$transaction(async (tx) => {
      const { order, delivery } = await lockOwnDelivery(tx, orderId, partner.id);
      if (order.status === OrderStatus.ASSIGNED && !delivery.acceptedAt) {
        throw new AppError(409, "NOT_ACCEPTED", "Accept the delivery before picking it up");
      }

      await transitionOrder(tx, {
        orderId,
        scope: { partnerId: partner.id },
        allowedFrom: [OrderStatus.ASSIGNED],
        to: OrderStatus.PICKED_UP,
        changedById: userId,
      });
      await tx.delivery.update({
        where: { id: delivery.id },
        data: { status: DeliveryStatus.PICKED_UP, pickedUpAt: new Date() },
      });
    });

    return findView(partner.id, orderId);
  }

  async function startDelivery(userId: string, orderId: string) {
    const partner = await resolvePartner(userId);

    await prisma.$transaction(async (tx) => {
      await transitionOrder(tx, {
        orderId,
        scope: { partnerId: partner.id },
        allowedFrom: [OrderStatus.PICKED_UP],
        to: OrderStatus.OUT_FOR_DELIVERY,
        changedById: userId,
      });
      await tx.delivery.update({ where: { orderId }, data: { status: DeliveryStatus.OUT_FOR_DELIVERY } });
    });

    return findView(partner.id, orderId);
  }

  async function markDelivered(userId: string, orderId: string, otp: string) {
    const partner = await resolvePartner(userId);
    const ref = await prisma.delivery.findFirst({ where: { orderId, partnerId: partner.id }, select: { id: true } });

    if (!ref) {
      throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
    }

    const attemptsKey = otpAttemptsKey(ref.id);
    const attempts = await redis.incr(attemptsKey);
    if (attempts === 1) {
      await redis.expire(attemptsKey, OTP_LOCK_SECONDS);
    }
    if (attempts > OTP_MAX_ATTEMPTS) {
      throw new AppError(429, "TOO_MANY_OTP_ATTEMPTS", "Too many wrong OTPs; try again later", {
        retryAfterSeconds: await redis.ttl(attemptsKey),
      });
    }

    await prisma.$transaction(async (tx) => {
      const { order, delivery } = await lockOwnDelivery(tx, orderId, partner.id);
      if (order.status !== OrderStatus.OUT_FOR_DELIVERY) {
        throw new AppError(409, "INVALID_STATUS_TRANSITION", `Cannot deliver an order that is ${order.status}`, {
          status: order.status,
          allowedFrom: [OrderStatus.OUT_FOR_DELIVERY],
        });
      }
      if (!delivery.deliveryOtpHash || !verifyDeliveryOtp(delivery.id, otp, delivery.deliveryOtpHash)) {
        throw new AppError(400, "INVALID_OTP", "The delivery OTP is incorrect", {
          attemptsLeft: OTP_MAX_ATTEMPTS - attempts,
        });
      }

      const now = new Date();
      await transitionOrder(tx, {
        orderId,
        scope: { partnerId: partner.id },
        allowedFrom: [OrderStatus.OUT_FOR_DELIVERY],
        to: OrderStatus.DELIVERED,
        changedById: userId,
      });
      await tx.delivery.update({
        where: { id: delivery.id },
        data: {
          status: DeliveryStatus.DELIVERED,
          deliveredAt: now,
          earning: (await getPlatformSettings(tx)).deliveryPartnerFee,
        },
      });
      await freePartner(tx, partner.id);
      await tx.payment.updateMany({
        where: { orderId, method: PaymentMethod.COD, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.PAID, paidAt: now, provider: "cash" },
      });
    });

    await redis.del(attemptsKey);
    return findView(partner.id, orderId);
  }

  async function history(userId: string, { limit, offset }: { limit: number; offset: number }) {
    const partner = await resolvePartner(userId);
    const where: Prisma.DeliveryWhereInput = {
      partnerId: partner.id,
      status: { in: [DeliveryStatus.DELIVERED, DeliveryStatus.CANCELLED] },
    };

    const [rows, total] = await prisma.$transaction([
      prisma.delivery.findMany({ where, include: deliveryInclude, orderBy: { updatedAt: "desc" }, take: limit, skip: offset }),
      prisma.delivery.count({ where }),
    ]);

    return { items: rows.map(toPartnerView), total, limit, offset };
  }

  async function earnings(userId: string, { from, to }: { from: Date; to: Date }) {
    const partner = await resolvePartner(userId);
    const delivered: Prisma.DeliveryWhereInput = {
      partnerId: partner.id,
      status: DeliveryStatus.DELIVERED,
      deliveredAt: { gte: from, lt: to },
    };

    const [summary, cash] = await Promise.all([
      prisma.delivery.aggregate({ where: delivered, _count: { _all: true }, _sum: { earning: true } }),
      prisma.order.aggregate({
        where: { paymentMethod: PaymentMethod.COD, delivery: { is: delivered } },
        _sum: { total: true },
      }),
    ]);

    return {
      from,
      to,
      currency: env.CURRENCY,
      deliveries: summary._count._all,
      earnings: (summary._sum.earning ?? new Prisma.Decimal(0)).toFixed(2),
      cashCollected: (cash._sum.total ?? new Prisma.Decimal(0)).toFixed(2),
    };
  }

  async function assign(storeId: string, orderId: string, partnerId: string, adminId: string) {
    await prisma.$transaction(async (tx) => {
      const order = await lockOrder(tx, orderId, { storeId });
      if (order.status !== OrderStatus.READY_FOR_PICKUP) {
        throw new AppError(409, "INVALID_STATUS_TRANSITION", `Cannot assign an order that is ${order.status}`, {
          status: order.status,
          allowedFrom: [OrderStatus.READY_FOR_PICKUP],
        });
      }
      const partner = assertAvailable((await lockPartners(tx, [partnerId])).get(partnerId));

      await transitionOrder(tx, {
        orderId,
        scope: { storeId },
        allowedFrom: [OrderStatus.READY_FOR_PICKUP],
        to: OrderStatus.ASSIGNED,
        changedById: adminId,
        note: `Assigned to ${partner.name ?? "delivery partner"}`,
      });

      const now = new Date();
      const delivery = await tx.delivery.upsert({
        where: { orderId },
        create: { orderId, partnerId, status: DeliveryStatus.ASSIGNED, assignedAt: now },
        update: { partnerId, status: DeliveryStatus.ASSIGNED, assignedAt: now, acceptedAt: null },
      });
      if (!delivery.deliveryOtpHash) {
        await tx.delivery.update({
          where: { id: delivery.id },
          data: { deliveryOtpHash: hashDeliveryOtp(delivery.id, deliveryOtp(delivery.id)) },
        });
      }
      await tx.deliveryPartner.update({ where: { id: partnerId }, data: { status: DeliveryPartnerStatus.BUSY } });
    });
  }

  async function reassign(storeId: string, orderId: string, partnerId: string, adminId: string) {
    await prisma.$transaction(async (tx) => {
      const order = await lockOrder(tx, orderId, { storeId });
      if (order.status !== OrderStatus.ASSIGNED) {
        throw new AppError(409, "INVALID_STATUS_TRANSITION", `Cannot reassign an order that is ${order.status}`, {
          status: order.status,
          allowedFrom: [OrderStatus.ASSIGNED],
        });
      }

      const delivery = await tx.delivery.findUniqueOrThrow({ where: { orderId } });
      if (delivery.partnerId === partnerId) {
        throw new AppError(409, "SAME_PARTNER", "The order is already assigned to this partner");
      }

      const partners = await lockPartners(tx, delivery.partnerId ? [partnerId, delivery.partnerId] : [partnerId]);
      const partner = assertAvailable(partners.get(partnerId));

      await transitionOrder(tx, {
        orderId,
        scope: { storeId },
        allowedFrom: [OrderStatus.ASSIGNED],
        to: OrderStatus.ASSIGNED,
        changedById: adminId,
        note: `Reassigned to ${partner.name ?? "delivery partner"}`,
      });
      await tx.delivery.update({
        where: { id: delivery.id },
        data: { partnerId, assignedAt: new Date(), acceptedAt: null },
      });
      await tx.deliveryPartner.update({ where: { id: partnerId }, data: { status: DeliveryPartnerStatus.BUSY } });
      if (delivery.partnerId) {
        await freePartner(tx, delivery.partnerId);
      }
    });
  }

  return {
    resolvePartner,
    getMe,
    setStatus,
    listActive,
    getDelivery,
    accept,
    decline,
    pickup,
    startDelivery,
    markDelivered,
    history,
    earnings,
    assign,
    reassign,
  };
}
