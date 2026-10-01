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
import { reserveStock } from "../inventory/inventory.service.js";
import { customerVisible } from "../products/store-products.service.js";
import { storeServesLocation } from "../stores/geo.js";
import { transitionOrder } from "./order-status.js";
import type { CreateOrderInput, ListOrdersQuery } from "./orders.schemas.js";

export const CUSTOMER_CANCELLABLE_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING_PAYMENT,
  OrderStatus.CONFIRMED,
];

const DELIVERY_FEE = new Prisma.Decimal(env.DELIVERY_FEE);
const FREE_DELIVERY_THRESHOLD = new Prisma.Decimal(env.FREE_DELIVERY_THRESHOLD);
const MIN_ORDER_VALUE = new Prisma.Decimal(env.MIN_ORDER_VALUE);

const ORDER_NUMBER_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function generateOrderNumber() {
  const date = new Date().toISOString().slice(2, 10).replaceAll("-", "");
  const suffix = Array.from({ length: 6 }, () => ORDER_NUMBER_ALPHABET[randomInt(ORDER_NUMBER_ALPHABET.length)]).join("");
  return `ORD-${date}-${suffix}`;
}

export const orderDetailInclude = {
  store: { select: { id: true, name: true, phone: true } },
  items: { orderBy: { createdAt: "asc" } },
  payment: { select: { method: true, status: true, amount: true, paidAt: true } },
  statusHistory: {
    orderBy: { createdAt: "asc" },
    select: { fromStatus: true, toStatus: true, note: true, createdAt: true },
  },
} satisfies Prisma.OrderInclude;

export type OrderDetail = Prisma.OrderGetPayload<{ include: typeof orderDetailInclude }>;

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
      paidAt: order.payment.paidAt,
    },
    store: order.store,
    items: order.items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toFixed(2),
      totalPrice: item.totalPrice.toFixed(2),
    })),
    subtotal: order.subtotal.toFixed(2),
    deliveryFee: order.deliveryFee.toFixed(2),
    discount: order.discount.toFixed(2),
    total: order.total.toFixed(2),
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
    statusHistory: order.statusHistory,
    createdAt: order.createdAt,
  };
}

export function createOrdersService(prisma: PrismaClient) {
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

  async function listOrders(userId: string, { limit, offset, status }: ListOrdersQuery) {
    const where: Prisma.OrderWhereInput = { userId, ...(status && { status }) };

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
          _count: { select: { items: true } },
        },
      }),
      prisma.order.count({ where }),
    ]);

    return {
      items: orders.map(({ _count, total: orderTotal, ...order }) => ({
        ...order,
        total: orderTotal.toFixed(2),
        itemCount: _count.items,
        canCancel: CUSTOMER_CANCELLABLE_STATUSES.includes(order.status),
      })),
      total,
      limit,
      offset,
    };
  }

  async function createOrder(userId: string, { addressId, paymentMethod }: CreateOrderInput) {
    const cartRef = await prisma.cart.findUnique({ where: { userId }, select: { id: true } });

    if (!cartRef) {
      throw new AppError(409, "CART_EMPTY", "Your cart is empty");
    }

    const orderId = await prisma.$transaction(
      async (tx) => {
        await lockCart(tx, cartRef.id);

        const cart = await tx.cart.findUniqueOrThrow({
          where: { id: cartRef.id },
          include: { items: { include: { product: { select: { name: true } } } } },
        });

        if (!cart.storeId || cart.items.length === 0) {
          throw new AppError(409, "CART_EMPTY", "Your cart is empty");
        }
        const storeId = cart.storeId;

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
            productId: { in: cart.items.map((item) => item.productId) },
            ...customerVisible,
          },
          select: { id: true, productId: true, sellingPrice: true },
        });
        const byProductId = new Map(storeProducts.map((sp) => [sp.productId, sp]));

        const unavailable = cart.items.filter((item) => !byProductId.has(item.productId));
        if (unavailable.length > 0) {
          throw new AppError(
            409,
            "CART_INVALID",
            "Some items in your cart are no longer available",
            unavailable.map((item) => ({ productId: item.productId, name: item.product.name })),
          );
        }

        const lines = cart.items.map((item) => {
          const storeProduct = byProductId.get(item.productId)!;
          return {
            storeProductId: storeProduct.id,
            productId: item.productId,
            productName: item.product.name,
            quantity: item.quantity,
            unitPrice: storeProduct.sellingPrice,
            totalPrice: storeProduct.sellingPrice.mul(item.quantity),
          };
        });

        const subtotal = lines.reduce((sum, line) => sum.add(line.totalPrice), new Prisma.Decimal(0));

        if (subtotal.lt(MIN_ORDER_VALUE)) {
          throw new AppError(400, "MIN_ORDER_NOT_MET", `Minimum order value is ${MIN_ORDER_VALUE.toFixed(2)}`, {
            minOrderValue: MIN_ORDER_VALUE.toFixed(2),
            subtotal: subtotal.toFixed(2),
          });
        }

        const deliveryFee = subtotal.gte(FREE_DELIVERY_THRESHOLD) ? new Prisma.Decimal(0) : DELIVERY_FEE;
        const discount = new Prisma.Decimal(0);
        const total = subtotal.add(deliveryFee).sub(discount);

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
                name: byStoreProductId.get(shortage.storeProductId)?.productName,
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
              create: lines.map(({ productId, productName, quantity, unitPrice, totalPrice }) => ({
                productId,
                productName,
                quantity,
                unitPrice,
                totalPrice,
              })),
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

    return getOrder(userId, orderId);
  }

  return { getOrder, listOrders, createOrder, cancelOrder };
}
