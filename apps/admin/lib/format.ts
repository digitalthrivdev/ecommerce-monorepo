import type { OrderStatus, PaymentMethod } from "./types";

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

export const ROLE_LABELS = {
  ADMIN: "Admin",
  STORE_STAFF: "Store staff",
} as const;
