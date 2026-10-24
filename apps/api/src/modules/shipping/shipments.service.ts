import { randomUUID } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

import type { FastifyBaseLogger } from "fastify";

import { OrderStatus, PaymentMethod, Prisma, ShipmentStatus, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { lockOrder } from "../orders/order-status.js";
import { getPlatformSettings } from "../settings/settings.service.js";
import { activeShippingProvider, getShippingProvider } from "./carrier-registry.js";
import { defaultPickupLocation } from "./pickup-locations.service.js";
import { CANCELLABLE_SHIPMENT_STATUSES, recordShipmentEvents } from "./shipment-status.js";
import { HAND_TRACKED_CARRIERS, type ShipmentEventInput, type ShipmentRef, type ShippingProvider } from "./shipping-provider.js";
import type { ShipmentEventBody, ShipOrderBody } from "./shipments.schemas.js";

type Actor = { userId: string };

const refOf = (shipment: ShipmentRef): ShipmentRef => ({
  providerOrderId: shipment.providerOrderId,
  providerShipmentId: shipment.providerShipmentId,
  awb: shipment.awb,
});

function notFound(): never {
  throw new AppError(404, "SHIPMENT_NOT_FOUND", "This order has no shipment");
}

export function createShipmentsService(prisma: PrismaClient, log: FastifyBaseLogger) {
  /** The order's current shipment, or a 404 when it has none (or only a cancelled one). */
  async function currentShipment(orderId: string) {
    const shipment = await prisma.shipment.findUnique({ where: { orderId } });
    if (!shipment || shipment.status === ShipmentStatus.CANCELLED) notFound();
    return shipment;
  }

  async function providerFor(name: string) {
    const provider = await getShippingProvider(prisma, name);
    if (!provider) {
      throw new AppError(409, "SHIPPING_CARRIER_UNAVAILABLE", "The carrier of this shipment is no longer set up. Restore its keys in Settings.");
    }
    return provider;
  }

  async function cancelQuietly(provider: ShippingProvider, ref: ShipmentRef, orderId: string) {
    try {
      await provider.cancelShipment(ref);
    } catch (error) {
      log.error({ err: error, orderId, provider: provider.name, ...ref }, "Could not cancel a shipment that was not saved; cancel it with the carrier");
    }
  }

  /**
   * Books the packed order with the active carrier: creates the shipment, gets the AWB, schedules
   * the pickup and fetches the label. The carrier is called before the order is locked, so the
   * order is checked again before the shipment is saved; a booking that loses that race is cancelled.
   */
  async function shipOrder(orderId: string, input: ShipOrderBody, actor: Actor) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { orderBy: { createdAt: "asc" } }, shipment: { select: { status: true } } },
    });
    if (!order || order.status === OrderStatus.PENDING_PAYMENT) {
      throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
    }
    const assertShippable = (status: OrderStatus, shipment: { status: ShipmentStatus } | null) => {
      if (shipment && shipment.status !== ShipmentStatus.CANCELLED) {
        throw new AppError(409, "SHIPMENT_EXISTS", "This order already has a shipment. Cancel it first to ship again.");
      }
      if (status !== OrderStatus.PACKED) {
        throw new AppError(409, "ORDER_NOT_PACKED", "Only packed orders can be shipped", { status });
      }
    };
    assertShippable(order.status, order.shipment);

    const pickup = await defaultPickupLocation(prisma);
    if (!pickup) {
      throw new AppError(409, "PICKUP_LOCATION_REQUIRED", "Add a pickup location in Settings before shipping");
    }
    const provider = await activeShippingProvider(prisma, await getPlatformSettings(prisma));
    const parcel = {
      weightGrams: input.weightGrams,
      lengthCm: new Prisma.Decimal(input.lengthCm),
      breadthCm: new Prisma.Decimal(input.breadthCm),
      heightCm: new Prisma.Decimal(input.heightCm),
    };

    const booked = await provider.createShipment({
      orderNumber: order.orderNumber,
      orderDate: order.createdAt,
      pickup: {
        id: pickup.id,
        name: pickup.contactName,
        phone: pickup.phone,
        addressLine1: pickup.addressLine1,
        addressLine2: pickup.addressLine2,
        landmark: pickup.landmark,
        city: pickup.city,
        state: pickup.state,
        postalCode: pickup.postalCode,
      },
      delivery: {
        name: order.customerName,
        phone: order.customerPhone,
        addressLine1: order.addressLine1,
        addressLine2: order.addressLine2,
        landmark: order.landmark,
        city: order.city,
        state: order.state,
        postalCode: order.postalCode,
      },
      items: order.items
        .filter((item) => item.quantity > item.unavailableQuantity)
        .map((item) => ({
          name: item.variantName ? `${item.productName} (${item.variantName})` : item.productName,
          sku: item.sku,
          hsn: item.hsnCode,
          quantity: item.quantity - item.unavailableQuantity,
          unitPrice: item.unitPrice,
        })),
      codAmount: order.paymentMethod === PaymentMethod.COD ? order.total : new Prisma.Decimal(0),
      orderTotal: order.total,
      parcel,
      manual: input.awb && input.courierName ? { awb: input.awb, courierName: input.courierName, trackingUrl: input.trackingUrl ?? null } : undefined,
    });

    let shipment = { ...booked, labelUrl: null as string | null };
    try {
      if (!shipment.awb) {
        shipment = { ...shipment, ...(await provider.assignAwb(refOf(shipment))), status: ShipmentStatus.AWB_ASSIGNED };
      }
      if (shipment.status === ShipmentStatus.AWB_ASSIGNED) {
        shipment.status = (await provider.schedulePickup(refOf(shipment))).status;
      }
    } catch (error) {
      await cancelQuietly(provider, refOf(shipment), orderId);
      throw error;
    }
    try {
      shipment.labelUrl = (await provider.getLabel(refOf(shipment)))?.labelUrl ?? null;
    } catch (error) {
      // The label can be fetched again from the order page.
      log.warn({ err: error, orderId, provider: provider.name }, "Could not fetch the shipping label");
    }

    try {
      await prisma.$transaction(async (tx) => {
        const locked = await lockOrder(tx, orderId);
        assertShippable(locked.status, await tx.shipment.findUnique({ where: { orderId }, select: { status: true } }));

        const data = {
          provider: provider.name,
          providerOrderId: shipment.providerOrderId,
          providerShipmentId: shipment.providerShipmentId,
          awb: shipment.awb,
          courierName: shipment.courierName,
          trackingUrl: shipment.trackingUrl,
          labelUrl: shipment.labelUrl,
          // The booking event below sets the status.
          status: ShipmentStatus.PENDING,
          statusAt: new Date(0),
          ...parcel,
          createdById: actor.userId,
        };
        const saved = await tx.shipment.upsert({ where: { orderId }, create: { orderId, ...data }, update: data, select: { id: true } });

        await recordShipmentEvents(tx, {
          orderId,
          shipmentId: saved.id,
          changedById: actor.userId,
          events: [
            {
              status: shipment.status,
              providerEventId: `booked:${randomUUID()}`,
              occurredAt: new Date(),
              location: null,
              description: [shipment.courierName, shipment.awb && `AWB ${shipment.awb}`].filter(Boolean).join(", ") || "Shipment booked",
            },
          ],
        });
      });
    } catch (error) {
      if (provider.reportsTracking) await cancelQuietly(provider, refOf(shipment), orderId);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError(409, "AWB_IN_USE", "Another shipment already has this AWB number", { field: "awb" });
      }
      throw error;
    }
  }

  /**
   * Cancels the shipment with the carrier before pickup. A manual shipment can also be cancelled
   * after it was recorded as handed over (e.g. a mistyped AWB); the order goes back to packed.
   */
  async function cancelShipment(orderId: string, actor: Actor) {
    const shipment = await currentShipment(orderId);
    const provider = await providerFor(shipment.provider);
    const cancellable =
      CANCELLABLE_SHIPMENT_STATUSES.includes(shipment.status) || (!provider.reportsTracking && shipment.status === ShipmentStatus.PICKED_UP);
    if (!cancellable) {
      throw new AppError(409, "SHIPMENT_NOT_CANCELLABLE", "The courier has the parcel, so the shipment can't be cancelled", {
        status: shipment.status,
      });
    }

    await provider.cancelShipment(refOf(shipment));
    await prisma.$transaction((tx) =>
      recordShipmentEvents(tx, {
        orderId,
        shipmentId: shipment.id,
        changedById: actor.userId,
        events: [{ status: ShipmentStatus.CANCELLED, providerEventId: `cancelled:${randomUUID()}`, occurredAt: new Date(), location: null, description: "Shipment cancelled" }],
      }),
    );
  }

  async function refreshLabel(orderId: string) {
    const shipment = await currentShipment(orderId);
    const label = await (await providerFor(shipment.provider)).getLabel(refOf(shipment));
    if (!label) {
      throw new AppError(409, "LABEL_NOT_AVAILABLE", "This carrier has no label; use the courier's own label");
    }
    await prisma.shipment.update({ where: { id: shipment.id }, data: { labelUrl: label.labelUrl } });
  }

  /** A tracking update typed by an admin, for carriers that don't report tracking (and the test carrier). */
  async function addEvent(orderId: string, input: ShipmentEventBody, actor: Actor) {
    const shipment = await currentShipment(orderId);
    if (!HAND_TRACKED_CARRIERS.includes(shipment.provider)) {
      throw new AppError(409, "TRACKING_FROM_CARRIER", "The carrier reports tracking for this shipment");
    }

    const recorded = await prisma.$transaction((tx) =>
      recordShipmentEvents(tx, {
        orderId,
        shipmentId: shipment.id,
        changedById: actor.userId,
        events: [
          {
            status: input.status,
            providerEventId: `admin:${randomUUID()}`,
            occurredAt: input.occurredAt ?? new Date(),
            location: input.location ?? null,
            description: input.description ?? null,
          },
        ],
      }),
    );
    return recorded;
  }

  /** Fetches the carrier's tracking history and records anything new. */
  async function syncTracking(orderId: string) {
    const shipment = await currentShipment(orderId);
    const events = await (await providerFor(shipment.provider)).track(refOf(shipment));
    if (events.length === 0) return 0;
    return prisma.$transaction((tx) => recordShipmentEvents(tx, { orderId, shipmentId: shipment.id, changedById: null, events }));
  }

  /**
   * Periodic background sweep for active shipments: polls carrier tracking for shipments that
   * have not yet reached a final status and records any new events.
   */
  async function sweepTracking(): Promise<{ checked: number; updated: number }> {
    const activeShipments = await prisma.shipment.findMany({
      where: {
        status: { notIn: [ShipmentStatus.DELIVERED, ShipmentStatus.RTO_DELIVERED, ShipmentStatus.CANCELLED] },
        provider: { notIn: [...HAND_TRACKED_CARRIERS] },
        OR: [{ awb: { not: null } }, { providerShipmentId: { not: null } }],
      },
      select: { orderId: true, provider: true, awb: true },
    });

    let updated = 0;
    for (const shipment of activeShipments) {
      try {
        const newEventsCount = await syncTracking(shipment.orderId);
        if (newEventsCount > 0) updated++;
      } catch (error) {
        log.warn({ err: error, orderId: shipment.orderId, provider: shipment.provider, awb: shipment.awb }, "Failed to sync tracking during background sweep");
      }
    }

    return { checked: activeShipments.length, updated };
  }

  /** Carrier webhooks. Updates already recorded and unknown shipments are acknowledged, so the carrier stops retrying. */
  async function handleWebhook(carrier: string, rawBody: string, headers: IncomingHttpHeaders) {
    const provider = await getShippingProvider(prisma, carrier);
    if (!provider) {
      throw new AppError(404, "NOT_FOUND", "Unknown shipping carrier");
    }
    const webhook = provider.parseWebhook(rawBody, headers);
    if (!webhook) {
      throw new AppError(401, "INVALID_WEBHOOK_SIGNATURE", "Webhook signature is invalid");
    }
    if (webhook.type === "ignored") return;

    const shipment = await prisma.shipment.findFirst({
      where: {
        provider: provider.name,
        OR: [
          ...(webhook.awb ? [{ awb: webhook.awb }] : []),
          ...(webhook.providerShipmentId ? [{ providerShipmentId: webhook.providerShipmentId }] : []),
        ],
      },
      select: { id: true, orderId: true },
    });
    if (!shipment) {
      log.warn({ provider: provider.name, awb: webhook.awb, providerShipmentId: webhook.providerShipmentId }, "Shipping webhook for an unknown shipment");
      return;
    }

    const event: ShipmentEventInput = webhook.event;
    await prisma.$transaction((tx) =>
      recordShipmentEvents(tx, { orderId: shipment.orderId, shipmentId: shipment.id, changedById: null, events: [event] }),
    );
  }

  return { shipOrder, cancelShipment, refreshLabel, addEvent, syncTracking, sweepTracking, handleWebhook };
}

export type ShipmentsService = ReturnType<typeof createShipmentsService>;
