export const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Waiting for payment",
  CONFIRMED: "Confirmed",
  PACKED: "Packed",
  SHIPPED: "Shipped",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  RTO: "Returned to seller",
};

export const SHIPMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "Preparing shipment",
  AWB_ASSIGNED: "Courier assigned",
  PICKUP_SCHEDULED: "Pickup scheduled",
  PICKED_UP: "Picked up",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  NDR: "Delivery attempted",
  RTO_IN_TRANSIT: "Returning to us",
  RTO_DELIVERED: "Returned to us",
  CANCELLED: "Shipment cancelled",
  LOST: "Shipment lost",
};

export const CART_ISSUE: Record<string, string> = {
  UNAVAILABLE: "This item is no longer sold",
  OUT_OF_STOCK: "Out of stock",
  INSUFFICIENT_STOCK: "Not enough in stock",
  QUANTITY_LIMIT: "Quantity is over the limit for this item",
};

export function orderStatusLabel(status: string) {
  return ORDER_STATUS_LABEL[status] ?? status;
}

export function shipmentStatusLabel(status: string) {
  return SHIPMENT_STATUS_LABEL[status] ?? status;
}
