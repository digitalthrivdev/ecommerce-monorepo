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
import { deliveryOtp } from "../delivery/delivery-otp.js";
import { reserveStock } from "../inventory/inventory.service.js";
import { activePaymentProvider } from "../payments/gateway-registry.js";
import { paymentDeadline, type PaymentsService } from "../payments/payments.service.js";
import { calculateCharges, getPlatformSettings } from "../settings/settings.service.js";
import { imageOrder, imagesFor, maxOrderQuantity, variantLabel } from "../products/catalog.js";
import { customerVisible } from "../products/store-products.service.js";
import { storeServesLocation } from "../stores/geo.js";
import { hoursOrder, hoursSelect, isStoreOpen } from "../stores/store-hours.js";
import { assertCanOrder, assertCodAllowed, customerOrderBlock } from "./checkout-rules.js";
import { ACTIVE_ORDER_STATUSES, transitionOrder } from "./order-status.js";
import { includedTax } from "./tax.js";
import type { CreateOrderInput, ListOrdersQuery } from "./orders.schemas.js";

export const CUSTOMER_CANCELLABLE_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING_PAYMENT,
  OrderStatus.CONFIRMED,
];

const CUSTOMER_OPEN_STATUSES: OrderStatus[] = [OrderStatus.PENDING_PAYMENT, ...ACTIVE_ORDER_STATUSES];

const OTP_VISIBLE_STATUSES: OrderStatus[] = [
  OrderStatus.ASSIGNED,
  OrderStatus.PICKED_UP,
  OrderStatus.OUT_FOR_DELIVERY,
];

const ORDER_NUMBER_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function generateOrderNumber() {
  const date = new Date().toISOString().slice(2, 10).replaceAll("-", "");
  const suffix = Array.from({ length: 6 }, () => ORDER_NUMBER_ALPHABET[randomInt(ORDER_NUMBER_ALPHABET.length)]).join("");
  return `ORD-${date}-${suffix}`;
}

export const orderDetailInclude = {
  store: { select: { id: true, name: true, phone: true } },
  items: { orderBy: { createdAt: "asc" } },
  payment: { select: { method: true, status: true, amount: true, refundedAmount: true, paidAt: true, refundedAt: true } },
  delivery: {
    select: {
      id: true,
      status: true,
      assignedAt: true,
      pickedUpAt: true,
      deliveredAt: true,
      failure: true,
      partner: {
        select: { vehicleType: true, vehicleNumber: true, user: { select: { name: true, phone: true } } },
      },
    },
  },
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
} satisfies Prisma.OrderInclude;

export type OrderDetail = Prisma.OrderGetPayload<{ include: typeof orderDetailInclude }>;

/** How long after delivery a customer can report a problem (the refund policy page says 24 hours). */
export const COMPLAINT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function complaintDeadline(deliveredAt: Date | null | undefined) {
  return deliveredAt ? new Date(deliveredAt.getTime() + COMPLAINT_WINDOW_MS) : null;
}

function canReportIssue(order: Pick<OrderDetail, "status" | "complaint" | "delivery">) {
  const deadline = complaintDeadline(order.delivery?.deliveredAt);
  return order.status === OrderStatus.DELIVERED && !order.complaint && deadline !== null && deadline > new Date();
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
    delivery: order.delivery && {
      status: order.delivery.status,
      partner: order.delivery.partner && {
        name: order.delivery.partner.user.name,
        phone: order.delivery.partner.user.phone,
        vehicleType: order.delivery.partner.vehicleType,
        vehicleNumber: order.delivery.partner.vehicleNumber,
      },
      assignedAt: order.delivery.assignedAt,
      pickedUpAt: order.delivery.pickedUpAt,
      deliveredAt: order.delivery.deliveredAt,
    },
    store: order.store,
    // quantity and totalPrice are as ordered; the units the store could not supply are not charged.
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
      mrp: item.mrp?.toFixed(2) ?? null,
      totalPrice: item.totalPrice.toFixed(2),
      chargedTotal: item.unitPrice.mul(item.quantity - item.unavailableQuantity).toFixed(2),
      hsnCode: item.hsnCode,
      gstRate: item.gstRate?.toFixed(2) ?? null,
      taxAmount: item.taxAmount.toFixed(2),
    })),
    subtotal: order.subtotal.toFixed(2),
    deliveryFee: order.deliveryFee.toFixed(2),
    discount: order.discount.toFixed(2),
    total: order.total.toFixed(2),
    // GST included in the item prices.
    taxTotal: order.taxTotal.toFixed(2),
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

    const view = toDetailView(order);
    // Only the customer sees the OTP; they share it with the partner at the door.
    const showOtp = order.delivery?.partner && OTP_VISIBLE_STATUSES.includes(order.status);
    return { ...view, deliveryOtp: showOtp ? deliveryOtp(order.delivery!.id) : null };
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
          store: { select: { id: true, name: true } },
          delivery: { select: { acceptedAt: true } },
          _count: { select: { items: true } },
        },
      }),
      prisma.order.count({ where }),
    ]);

    return {
      items: orders.map(({ _count, total: orderTotal, delivery, ...order }) => ({
        ...order,
        total: orderTotal.toFixed(2),
        itemCount: _count.items,
        // When the current rider accepted; the app opens the order then.
        riderAcceptedAt: delivery?.acceptedAt ?? null,
        canCancel: CUSTOMER_CANCELLABLE_STATUSES.includes(order.status),
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
            store: { select: { hours: { select: hoursSelect, orderBy: hoursOrder } } },
          },
        });

        if (!cart.storeId || cart.items.length === 0) {
          throw new AppError(409, "CART_EMPTY", "Your cart is empty");
        }
        const storeId = cart.storeId;

        if (!isStoreOpen(cart.store?.hours ?? [])) {
          throw new AppError(409, "STORE_CLOSED", "The store is closed right now. Please order when it opens.");
        }

        const address = await tx.address.findFirst({ where: { id: addressId, userId } });

        if (!address) {
          throw new AppError(404, "ADDRESS_NOT_FOUND", "Address not found");
        }
        if (address.latitude === null || address.longitude === null) {
          throw new AppError(400, "ADDRESS_LOCATION_REQUIRED", "Address needs a map location before ordering");
        }

        const serves = await storeServesLocation(
          tx,
          storeId,
          address.latitude.toNumber(),
          address.longitude.toNumber(),
        );

        if (!serves) {
          throw new AppError(409, "STORE_NOT_SERVICEABLE", "The store in your cart does not deliver to this address");
        }

        const storeProducts = await tx.storeProduct.findMany({
          where: {
            storeId,
            variantId: { in: cart.items.map((item) => item.variantId) },
            ...customerVisible,
          },
          select: { id: true, variantId: true, sellingPrice: true, mrp: true },
        });
        const byVariantId = new Map(storeProducts.map((sp) => [sp.variantId, sp]));

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

        const lines = cart.items.map((item) => {
          const { variant } = item;
          const storeProduct = byVariantId.get(item.variantId)!;
          const totalPrice = storeProduct.sellingPrice.mul(item.quantity);
          return {
            storeProductId: storeProduct.id,
            productId: variant.product.id,
            variantId: variant.id,
            productName: variant.product.name,
            variantName: variantLabel(variant),
            sku: variant.sku,
            imageUrl: imagesFor(variant.product.images, variant.id)[0]?.url ?? null,
            mrp: storeProduct.mrp,
            quantity: item.quantity,
            unitPrice: storeProduct.sellingPrice,
            totalPrice,
            hsnCode: variant.product.hsnCode,
            gstRate: variant.product.gstRate,
            taxAmount: includedTax(totalPrice, variant.product.gstRate),
          };
        });

        const subtotal = lines.reduce((sum, line) => sum.add(line.totalPrice), new Prisma.Decimal(0));
        const taxTotal = lines.reduce((sum, line) => sum.add(line.taxAmount), new Prisma.Decimal(0));
        const settings = await getPlatformSettings(tx);
        const charges = calculateCharges(subtotal, settings);

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
            const byStoreProductId = new Map(lines.map((line) => [line.storeProductId, line]));
            throw new AppError(
              409,
              "INSUFFICIENT_STOCK",
              "Some items do not have enough stock",
              error.details.map((shortage: { storeProductId: string; requested: number; available: number }) => ({
                productId: byStoreProductId.get(shortage.storeProductId)?.productId,
                variantId: byStoreProductId.get(shortage.storeProductId)?.variantId,
                name: byStoreProductId.get(shortage.storeProductId)?.productName,
                variantLabel: byStoreProductId.get(shortage.storeProductId)?.variantName,
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
            storeId,
            addressId: address.id,
            status,
            subtotal,
            deliveryFee,
            discount,
            total,
            taxTotal,
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
              create: lines.map(({ storeProductId: _storeProductId, ...line }) => line),
            },
            payment: { create: { method: paymentMethod, amount: total } },
            statusHistory: {
              create: { fromStatus: null, toStatus: status, changedById: userId, note: "Order placed" },
            },
          },
          select: { id: true },
        });

        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
        await tx.cart.update({ where: { id: cart.id }, data: { storeId: null } });

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
