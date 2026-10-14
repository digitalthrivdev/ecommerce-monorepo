import type { Prisma } from "../../generated/prisma/client";

export const shipmentInclude = {
  events: {
    orderBy: { occurredAt: "asc" },
    select: { status: true, occurredAt: true, location: true, description: true },
  },
} satisfies Prisma.ShipmentInclude;

export type ShipmentWithEvents = Prisma.ShipmentGetPayload<{ include: typeof shipmentInclude }>;

/** What the customer sees: the courier, the AWB and the tracking history. */
export function toTrackingView(shipment: ShipmentWithEvents) {
  return {
    status: shipment.status,
    courierName: shipment.courierName,
    awb: shipment.awb,
    trackingUrl: shipment.trackingUrl,
    events: shipment.events,
  };
}

/** For staff and admins: also the carrier, the label and the parcel as booked. */
export function toShipmentAdminView(shipment: ShipmentWithEvents) {
  return {
    ...toTrackingView(shipment),
    id: shipment.id,
    provider: shipment.provider,
    providerOrderId: shipment.providerOrderId,
    providerShipmentId: shipment.providerShipmentId,
    labelUrl: shipment.labelUrl,
    statusAt: shipment.statusAt,
    parcel: {
      weightGrams: shipment.weightGrams,
      lengthCm: shipment.lengthCm.toString(),
      breadthCm: shipment.breadthCm.toString(),
      heightCm: shipment.heightCm.toString(),
    },
    createdAt: shipment.createdAt,
  };
}
