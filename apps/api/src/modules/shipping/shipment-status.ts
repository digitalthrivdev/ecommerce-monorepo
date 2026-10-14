import { OrderStatus, ShipmentStatus, type Prisma } from "../../generated/prisma/client";
import { lockOrder, transitionOrder } from "../orders/order-status.js";
import type { ShipmentEventInput } from "./shipping-provider.js";

type Tx = Prisma.TransactionClient;

/** The order status each shipment status moves the order to. The others leave the order as it is. */
const ORDER_STATUS_FOR: Partial<Record<ShipmentStatus, OrderStatus>> = {
  [ShipmentStatus.PICKED_UP]: OrderStatus.SHIPPED,
  [ShipmentStatus.IN_TRANSIT]: OrderStatus.IN_TRANSIT,
  [ShipmentStatus.OUT_FOR_DELIVERY]: OrderStatus.OUT_FOR_DELIVERY,
  [ShipmentStatus.DELIVERED]: OrderStatus.DELIVERED,
  [ShipmentStatus.RTO_IN_TRANSIT]: OrderStatus.RTO,
  [ShipmentStatus.RTO_DELIVERED]: OrderStatus.RTO,
};

/** An order only moves forward along this path, so a late or repeated update can't move it back. */
const SHIPPING_PATH: OrderStatus[] = [
  OrderStatus.PACKED,
  OrderStatus.SHIPPED,
  OrderStatus.IN_TRANSIT,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.DELIVERED,
];

const ON_THE_WAY: OrderStatus[] = [OrderStatus.SHIPPED, OrderStatus.IN_TRANSIT, OrderStatus.OUT_FOR_DELIVERY];

/** A shipment in one of these keeps it; later updates are only recorded. */
export const FINAL_SHIPMENT_STATUSES: ShipmentStatus[] = [
  ShipmentStatus.DELIVERED,
  ShipmentStatus.RTO_DELIVERED,
  ShipmentStatus.CANCELLED,
];

/** Shipments that can still be cancelled with the carrier: the parcel has not been picked up. */
export const CANCELLABLE_SHIPMENT_STATUSES: ShipmentStatus[] = [
  ShipmentStatus.PENDING,
  ShipmentStatus.AWB_ASSIGNED,
  ShipmentStatus.PICKUP_SCHEDULED,
];

/** The order status a shipment update leads to, or null when the order stays as it is. */
export function orderStatusAfter(current: OrderStatus, shipment: ShipmentStatus): OrderStatus | null {
  if (shipment === ShipmentStatus.CANCELLED) {
    // A parcel recorded as handed over (manual) and then cancelled is back on the packing table.
    return current === OrderStatus.SHIPPED ? OrderStatus.PACKED : null;
  }
  const target = ORDER_STATUS_FOR[shipment];
  if (!target) return null;
  if (target === OrderStatus.RTO) {
    return ON_THE_WAY.includes(current) ? OrderStatus.RTO : null;
  }
  const from = SHIPPING_PATH.indexOf(current);
  return from >= 0 && SHIPPING_PATH.indexOf(target) > from ? target : null;
}

function describe(event: ShipmentEventInput) {
  return [event.description, event.location].filter(Boolean).join(" · ") || null;
}

/**
 * Records tracking updates (each once, by providerEventId), moves the shipment to the latest one
 * and the order along with it, writing each order change to its status history. Locks the order
 * first, like every order change. Returns how many updates were new.
 */
export async function recordShipmentEvents(
  tx: Tx,
  params: { orderId: string; shipmentId: string; events: ShipmentEventInput[]; changedById: string | null },
) {
  const order = await lockOrder(tx, params.orderId);
  const shipment = await tx.shipment.findUniqueOrThrow({
    where: { id: params.shipmentId },
    select: { status: true, statusAt: true },
  });

  const created = await tx.shipmentEvent.createManyAndReturn({
    data: params.events.map((event) => ({ ...event, shipmentId: params.shipmentId, createdById: params.changedById })),
    skipDuplicates: true,
    select: { status: true, occurredAt: true, description: true, location: true, providerEventId: true },
  });
  created.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  let status = shipment.status;
  let statusAt = shipment.statusAt;
  let orderStatus = order.status;
  for (const event of created) {
    if (FINAL_SHIPMENT_STATUSES.includes(status) || event.occurredAt < statusAt) continue;
    status = event.status;
    statusAt = event.occurredAt;

    const next = orderStatusAfter(orderStatus, event.status);
    if (next) {
      await transitionOrder(tx, {
        orderId: params.orderId,
        allowedFrom: [orderStatus],
        to: next,
        changedById: params.changedById,
        note: describe(event),
      });
      orderStatus = next;
    }
  }

  if (status !== shipment.status || statusAt.getTime() !== shipment.statusAt.getTime()) {
    await tx.shipment.update({ where: { id: params.shipmentId }, data: { status, statusAt } });
  }

  return created.length;
}
