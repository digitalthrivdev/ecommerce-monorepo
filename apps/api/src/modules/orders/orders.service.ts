import { randomInt } from "node:crypto";

import { env } from "../../config/env.js";
import {
  OrderStatus,
  PaymentMethod,
  Prisma,
  type PrismaClient,
} from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { lockCart } from "../cart/cart.service.js";
import { checkCoupon } from "../coupons/coupons.service.js";
import { reserveStock } from "../inventory/inventory.service.js";
import { activePaymentProvider } from "../payments/gateway-registry.js";
import { paymentDeadline, type PaymentsService } from "../payments/payments.service.js";
import { calculateCharges, getPlatformSettings } from "../settings/settings.service.js";
import { customerVisibleVariant, imageOrder, imagesFor, maxOrderQuantity, variantLabel } from "../products/catalog.js";
import { assertCanOrder, assertCodAllowed, customerOrderBlock } from "./checkout-rules.js";
import { ACTIVE_ORDER_STATUSES, deliveredAt, deliveredEntry, transitionOrder } from "./order-status.js";
import { discountShares, includedTax } from "./tax.js";
import type { CreateOrderInput, ListOrdersQuery } from "./orders.schemas.js";

export const CUSTOMER_CANCELLABLE_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING_PAYMENT,
  OrderStatus.CONFIRMED,
];

const CUSTOMER_OPEN_STATUSES: OrderStatus[] = [OrderStatus.PENDING_PAYMENT, ...ACTIVE_ORDER_STATUSES];

const ORDER_NUMBER_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function generateOrderNumber() {
  const date = new Date().toISOString().slice(2, 10).replaceAll("-", "");
  const suffix = Array.from({ length: 6 }, () => ORDER_NUMBER_ALPHABET[randomInt(ORDER_NUMBER_ALPHABET.length)]).join("");
  return `ORD-${date}-${suffix}`;
}

export const orderDetailInclude = {
  items: { orderBy: { createdAt: "asc" } },
  payment: { select: { method: true, status: true, amount: true, refundedAmount: true, paidAt: true, refundedAt: true } },
  statusHistory: {
    orderBy: { createdAt: "asc" },
    select: { fromStatus: true, toStatus: true, note: true, changedById: true, createdAt: true },
  },
  refunds: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      amount: true,
      method: true,
      reference: true,
      reason: true,
      complaintId: true,
      createdAt: true,
      createdBy: { select: { name: true } },
    },
  },
  complaint: {
    select: {
      id: true,
      reason: true,
      note: true,
      photoUrls: true,
      status: true,
      resolutionNote: true,
      createdAt: true,
      resolvedAt: true,
      items: { select: { orderItemId: true, quantity: true } },
    },
  },
  rating: { select: { deliveryRating: true, itemsRating: true, comment: true, createdAt: true } },
} satisfies Prisma.OrderInclude;

export type OrderDetail = Prisma.OrderGetPayload<{ include: typeof orderDetailInclude }>;

/** How long after delivery a customer can report a problem (the refund policy page says 24 hours). */
export const COMPLAINT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function complaintDeadline(deliveredAt: Date | null | undefined) {
  return deliveredAt ? new Date(deliveredAt.getTime() + COMPLAINT_WINDOW_MS) : null;
}

function canReportIssue(order: Pick<OrderDetail, "status" | "complaint" | "statusHistory">) {
  const deadline = complaintDeadline(deliveredAt(order.statusHistory));
  return order.status === OrderStatus.DELIVERED && !order.complaint && deadline !== null && deadline > new Date();
}

/** How long after delivery a customer can rate the order. */
export const RATING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function ratingDeadline(deliveredAt: Date | null | undefined) {
  return deliveredAt ? new Date(deliveredAt.getTime() + RATING_WINDOW_MS) : null;
}

function canRate(order: { status: OrderStatus; rating: unknown; statusHistory: { toStatus: OrderStatus; createdAt: Date }[] }) {
  const deadline = ratingDeadline(deliveredAt(order.statusHistory));
  return order.status === OrderStatus.DELIVERED && !order.rating && deadline !== null && deadline > new Date();
}

export function toDetailView(order: OrderDetail) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    canCancel: CUSTOMER_CANCELLABLE_STATUSES.includes(order.status),
    paymentMethod: order.paymentMethod,
    payment: order.payment && {
      status: order.payment.status,
      amount: order.payment.amount.toFixed(2),
      refundedAmount: order.payment.refundedAmount.toFixed(2),
      paidAt: order.payment.paidAt,
      refundedAt: order.payment.refundedAt,
    },
    paymentExpiresAt: order.status === OrderStatus.PENDING_PAYMENT ? paymentDeadline(order.createdAt) : null,
    deliveredAt: deliveredAt(order.statusHistory),
    // quantity and totalPrice are as ordered; the units that could not be supplied are not charged.
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      productName: item.productName,
      variantName: item.variantName,
      sku: item.sku,
      imageUrl: item.imageUrl,
      quantity: item.quantity,
      unavailableQuantity: item.unavailableQuantity,
      unitPrice: item.unitPrice.toFixed(2),
      compareAtPrice: item.compareAtPrice?.toFixed(2) ?? null,
      totalPrice: item.totalPrice.toFixed(2),
      chargedTotal: item.unitPrice.mul(item.quantity - item.unavailableQuantity).toFixed(2),
      hsnCode: item.hsnCode,
      gstRate: item.gstRate?.toFixed(2) ?? null,
      // Share of the coupon discount; taxAmount is the GST in chargedTotal minus this.
      discount: item.discount.toFixed(2),
      taxAmount: item.taxAmount.toFixed(2),
    })),
    subtotal: order.subtotal.toFixed(2),
    deliveryFee: order.deliveryFee.toFixed(2),
    discount: order.discount.toFixed(2),
    couponCode: order.couponCode,
    total: order.total.toFixed(2),
    // GST included in the item prices and the delivery fee.
    taxTotal: order.taxTotal.toFixed(2),
    deliveryFeeGstRate: order.deliveryFeeGstRate?.toFixed(2) ?? null,
    deliveryFeeTax: order.deliveryFeeTax.toFixed(2),
    invoiceNumber: order.invoiceNumber,
    deliveryAddress: {
      name: order.customerName,
      phone: order.customerPhone,
      addressLine1: order.addressLine1,
      addressLine2: order.addressLine2,
      landmark: order.landmark,
      city: order.city,
      state: order.state,
      postalCode: order.postalCode,
      latitude: order.latitude,
      longitude: order.longitude,
    },
    statusHistory: order.statusHistory.map(({ changedById: _changedById, ...entry }) => entry),
    refunds: order.refunds.map(({ id, amount, method, reason, createdAt }) => ({ id, amount: amount.toFixed(2), method, reason, createdAt })),
    complaint: order.complaint,
    canReportIssue: canReportIssue(order),
    rating: order.rating,
    canRate: canRate(order),
    createdAt: order.createdAt,
  };
}

export function createOrdersService(prisma: PrismaClient, payments: PaymentsService) {
  async function getOrder(userId: string, orderId: string) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId },
      include: orderDetailInclude,
    });

    if (!order) {
      throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
    }

    return toDetailView(order);
  }

  async function listOrders(userId: string, { limit, offset, status, active }: ListOrdersQuery) {
    const where: Prisma.OrderWhereInput = {
      userId,
      AND: [active ? { status: { in: CUSTOMER_OPEN_STATUSES } } : {}, status ? { status } : {}],
    };

    const [orders, total] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentMethod: true,
          total: true,
          createdAt: true,
          statusHistory: deliveredEntry,
          rating: { select: { id: true } },
          _count: { select: { items: true } },
        },
      }),
      prisma.order.count({ where }),
    ]);

    return {
      items: orders.map(({ _count, total: orderTotal, statusHistory, rating, ...order }) => ({
        ...order,
        total: orderTotal.toFixed(2),
        itemCount: _count.items,
        canCancel: CUSTOMER_CANCELLABLE_STATUSES.includes(order.status),
        canRate: canRate({ status: order.status, rating, statusHistory }),
      })),
      total,
      limit,
      offset,
    };
  }

  async function createOrder(userId: string, { addressId, paymentMethod }: CreateOrderInput) {
    const block = await customerOrderBlock(prisma, userId);
    assertCanOrder(block);
    if (paymentMethod === PaymentMethod.ONLINE && !(await activePaymentProvider(prisma, await getPlatformSettings(prisma)))) {
      throw new AppError(400, "ONLINE_PAYMENTS_DISABLED", "Online payments are not available");
    }

    const cartRef = await prisma.cart.findUnique({ where: { userId }, select: { id: true } });

    if (!cartRef) {
      throw new AppError(409, "CART_EMPTY", "Your cart is empty");
    }

    const orderId = await prisma.$transaction(
      async (tx) => {
        await lockCart(tx, cartRef.id);

        const cart = await tx.cart.findUniqueOrThrow({
          where: { id: cartRef.id },
          include: {
            items: {
              include: {
                variant: {
                  select: {
                    id: true,
                    sku: true,
                    name: true,
                    unit: true,
                    quantity: true,
                    maxOrderQuantity: true,
                    product: {
                      select: {
                        id: true,
                        name: true,
                        hsnCode: true,
                        gstRate: true,
                        images: { orderBy: imageOrder, select: { url: true, variantId: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        });

        if (cart.items.length === 0) {
          throw new AppError(409, "CART_EMPTY", "Your cart is empty");
        }

        const address = await tx.address.findFirst({ where: { id: addressId, userId } });

        if (!address) {
          throw new AppError(404, "ADDRESS_NOT_FOUND", "Address not found");
        }

        const sellable = await tx.productVariant.findMany({
          where: { id: { in: cart.items.map((item) => item.variantId) }, ...customerVisibleVariant },
          select: { id: true, price: true, compareAtPrice: true },
        });
        const byVariantId = new Map(sellable.map((row) => [row.id, row]));

        const describe = (item: (typeof cart.items)[number]) => ({
          productId: item.variant.product.id,
          variantId: item.variantId,
          name: item.variant.product.name,
          variantLabel: variantLabel(item.variant),
        });

        const unavailable = cart.items.filter((item) => !byVariantId.has(item.variantId));
        if (unavailable.length > 0) {
          throw new AppError(409, "CART_INVALID", "Some items in your cart are no longer available", unavailable.map(describe));
        }

        const overLimit = cart.items.filter((item) => item.quantity > maxOrderQuantity(item.variant));
        if (overLimit.length > 0) {
          throw new AppError(
            409,
            "QUANTITY_LIMIT",
            "Some items are over the limit per order",
            overLimit.map((item) => ({ ...describe(item), requested: item.quantity, maxQuantity: maxOrderQuantity(item.variant) })),
          );
        }

        const priced = cart.items.map((item) => {
          const { variant } = item;
          const { price, compareAtPrice } = byVariantId.get(item.variantId)!;
          return {
            productId: variant.product.id,
            variantId: variant.id,
            productName: variant.product.name,
            variantName: variantLabel(variant),
            sku: variant.sku,
            imageUrl: imagesFor(variant.product.images, variant.id)[0]?.url ?? null,
            compareAtPrice,
            quantity: item.quantity,
            unitPrice: price,
            totalPrice: price.mul(item.quantity),
            hsnCode: variant.product.hsnCode,
            gstRate: variant.product.gstRate,
          };
        });

        const subtotal = priced.reduce((sum, line) => sum.add(line.totalPrice), new Prisma.Decimal(0));
        const coupon = cart.couponCode ? await checkCoupon(tx, { code: cart.couponCode, userId, subtotal, lock: true }) : null;
        const settings = await getPlatformSettings(tx);
        const charges = calculateCharges(subtotal, settings, coupon?.discount);

        const shares = discountShares(
          priced.map((line) => line.totalPrice),
          charges.discount,
        );
        const lines = priced.map((line, index) => ({
          ...line,
          discount: shares[index]!,
          taxAmount: includedTax(line.totalPrice.minus(shares[index]!), line.gstRate),
        }));
        const deliveryFeeTax = includedTax(charges.deliveryFee, settings.deliveryFeeGstRate);
        const taxTotal = lines.reduce((sum, line) => sum.add(line.taxAmount), deliveryFeeTax);

        if (!charges.meetsMinimum) {
          throw new AppError(400, "MIN_ORDER_NOT_MET", `Minimum order value is ${charges.minOrderValue.toFixed(2)}`, {
            minOrderValue: charges.minOrderValue.toFixed(2),
            subtotal: subtotal.toFixed(2),
          });
        }
        if (paymentMethod === PaymentMethod.COD) {
          assertCodAllowed(settings, charges.total, block);
        }

        const { deliveryFee, discount, total } = charges;

        try {
          await reserveStock(tx, lines);
        } catch (error) {
          if (error instanceof AppError && error.code === "INSUFFICIENT_STOCK" && Array.isArray(error.details)) {
            const byVariantId = new Map(lines.map((line) => [line.variantId, line]));
            throw new AppError(
              409,
              "INSUFFICIENT_STOCK",
              "Some items do not have enough stock",
              error.details.map((shortage: { variantId: string; requested: number; available: number }) => ({
                productId: byVariantId.get(shortage.variantId)?.productId,
                variantId: shortage.variantId,
                name: byVariantId.get(shortage.variantId)?.productName,
                variantLabel: byVariantId.get(shortage.variantId)?.variantName,
                requested: shortage.requested,
                available: shortage.available,
              })),
            );
          }
          throw error;
        }

        const status = paymentMethod === PaymentMethod.COD ? OrderStatus.CONFIRMED : OrderStatus.PENDING_PAYMENT;

        const order = await tx.order.create({
          data: {
            orderNumber: generateOrderNumber(),
            userId,
            addressId: address.id,
            status,
            subtotal,
            deliveryFee,
            discount,
            total,
            taxTotal,
            deliveryFeeGstRate: settings.deliveryFeeGstRate,
            deliveryFeeTax,
            ...(coupon && { couponId: coupon.coupon.id, couponCode: coupon.coupon.code }),
            paymentMethod,
            customerName: address.name,
            customerPhone: address.phone,
            addressLine1: address.addressLine1,
            addressLine2: address.addressLine2,
            landmark: address.landmark,
            city: address.city,
            state: address.state,
            postalCode: address.postalCode,
            latitude: address.latitude,
            longitude: address.longitude,
            items: {
              create: lines,
            },
            payment: { create: { method: paymentMethod, amount: total } },
            statusHistory: {
              create: { fromStatus: null, toStatus: status, changedById: userId, note: "Order placed" },
            },
          },
          select: { id: true },
        });

        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
        await tx.cart.update({ where: { id: cart.id }, data: { couponCode: null } });

        return order.id;
      },
      { timeout: 15_000 },
    );

    return getOrder(userId, orderId);
  }

  async function cancelOrder(userId: string, orderId: string, reason?: string) {
    await prisma.$transaction((tx) =>
      transitionOrder(tx, {
        orderId,
        scope: { userId },
        allowedFrom: CUSTOMER_CANCELLABLE_STATUSES,
        to: OrderStatus.CANCELLED,
        changedById: userId,
        note: reason ?? "Cancelled by customer",
        notAllowed: { code: "ORDER_NOT_CANCELLABLE", message: "This order can no longer be cancelled" },
      }),
    );
    await payments.settleCancelledOrder(orderId);

    return getOrder(userId, orderId);
  }

  return { getOrder, listOrders, createOrder, cancelOrder };
}
