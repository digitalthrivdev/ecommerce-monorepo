import type { DeliveryPartnerStatus, DeliveryStatus, OrderAction, OrderStatus, PaymentMethod, PaymentStatus, UserRole } from "./types";

const LOCALE = "en-IN";

export function formatMoney(amount: string | number, currency: string) {
  return new Intl.NumberFormat(LOCALE, { style: "currency", currency }).format(Number(amount));
}

export function formatDateTime(value: string | Date, timeZone: string) {
  return new Intl.DateTimeFormat(LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

/** "500 g", "1 L"; null when the product has no pack size. */
export function formatPackSize(quantity: string | null, unit: string | null) {
  return [quantity && Number(quantity).toString(), unit].filter(Boolean).join(" ") || null;
}

/** "just now", "4 min ago", "2 hr ago". */
export function formatTimeAgo(value: string | Date) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const format = new Intl.RelativeTimeFormat(LOCALE, { numeric: "always", style: "short" });
  if (seconds < 3600) return format.format(-Math.floor(seconds / 60), "minute");
  if (seconds < 86_400) return format.format(-Math.floor(seconds / 3600), "hour");
  return format.format(-Math.floor(seconds / 86_400), "day");
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat(LOCALE).format(value);
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  CONFIRMED: "New",
  STORE_ACCEPTED: "Accepted",
  PICKING: "Picking",
  PACKED: "Packed",
  READY_FOR_PICKUP: "Ready for pickup",
  ASSIGNED: "Assigned",
  PICKED_UP: "Picked up",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  COD: "Cash on delivery",
  ONLINE: "Online",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  PAID: "Paid",
  FAILED: "Failed",
  REFUNDED: "Refunded",
};

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  PENDING: "Pending",
  ASSIGNED: "Assigned",
  PICKED_UP: "Picked up",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export const PARTNER_STATUS_LABELS: Record<DeliveryPartnerStatus, string> = {
  ONLINE: "Online",
  BUSY: "On a delivery",
  OFFLINE: "Offline",
};

export const ORDER_ACTION_LABELS: Record<OrderAction, string> = {
  accept: "Accept order",
  "start-picking": "Start picking",
  pack: "Mark packed",
  ready: "Ready for pickup",
  assign: "Assign partner",
  reassign: "Reassign partner",
  cancel: "Cancel order",
};

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Admin",
  STORE_STAFF: "Store staff",
  CUSTOMER: "Customer",
  DELIVERY_PARTNER: "Delivery partner",
};
