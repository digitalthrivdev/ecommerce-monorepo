import { OrderStatus, PaymentMethod, PaymentStatus } from "../../generated/prisma/client";

export type StatusChange = {
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  changedById: string | null;
  note: string | null;
};

/** The order as it is when the notification is sent, which can be a few seconds after the change. */
export type OrderContext = {
  id: string;
  orderNumber: string;
  userId: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus | null;
  storeName: string;
  /** Kept on cancelled deliveries, so the partner who held the order can still be told. */
  partnerUserId: string | null;
};

export type Notification = { userId: string; title: string; body: string; data: Record<string, string> };

const HELD_BY_PARTNER: OrderStatus[] = [OrderStatus.ASSIGNED, OrderStatus.PICKED_UP, OrderStatus.OUT_FOR_DELIVERY];

/**
 * Who to notify about an order status change, and what to say. Store staff and admins watch the
 * dashboard instead, and people are not notified about changes they made themselves.
 */
export function orderNotifications(change: StatusChange, order: OrderContext): Notification[] {
  const data = { type: "order_status", orderId: order.id, status: change.toStatus };
  const customer = (title: string, body: string) => ({ userId: order.userId, title, body, data });
  const partner = (title: string, body: string) =>
    order.partnerUserId && order.partnerUserId !== change.changedById ? [{ userId: order.partnerUserId, title, body, data }] : [];

  // The status did not move: the store marked items unavailable, and the note names them.
  if (change.fromStatus === change.toStatus) {
    const refund = order.paymentMethod === PaymentMethod.ONLINE ? "You'll get a refund for them." : "You won't be charged for them.";
    return [customer("Item unavailable", `${order.storeName}: ${change.note ?? "an item is unavailable"} in order ${order.orderNumber}. ${refund}`)];
  }

  switch (change.toStatus) {
    case OrderStatus.CONFIRMED:
      return [customer("Order confirmed", `We've received order ${order.orderNumber}. ${order.storeName} will start packing it soon.`)];

    case OrderStatus.ASSIGNED:
      return partner("New delivery", `Order ${order.orderNumber} from ${order.storeName} is assigned to you. Open the app to accept it.`);

    case OrderStatus.OUT_FOR_DELIVERY:
      return [customer("Your order is on the way", `Order ${order.orderNumber} is out for delivery. Keep your delivery OTP ready.`)];

    case OrderStatus.DELIVERED:
      return [customer("Order delivered", `Order ${order.orderNumber} has been delivered. Enjoy!`)];

    case OrderStatus.CANCELLED: {
      const paidOnline =
        order.paymentMethod === PaymentMethod.ONLINE &&
        (order.paymentStatus === PaymentStatus.PAID || order.paymentStatus === PaymentStatus.REFUNDED);
      return [
        ...(change.changedById === order.userId
          ? []
          : [customer("Order cancelled", `Order ${order.orderNumber} was cancelled.${paidOnline ? " Your payment will be refunded." : ""}`)]),
        ...(change.fromStatus && HELD_BY_PARTNER.includes(change.fromStatus)
          ? partner("Delivery cancelled", `Order ${order.orderNumber} was cancelled. If you have picked it up, return it to ${order.storeName}.`)
          : []),
      ];
    }

    default:
      return [];
  }
}
