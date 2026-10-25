import { randomUUID } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

import type { FastifyBaseLogger } from "fastify";

import { OrderStatus, PaymentMethod, Prisma, ShipmentStatus, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { lockOrder, transitionOrder } from "../orders/order-status.js";
import { MAX_WEIGHT_GRAMS } from "../products/products.schemas.js";
import { getPlatformSettings } from "../settings/settings.service.js";
import { activeShippingProvider, getShippingProvider } from "./carrier-registry.js";
import { defaultPickupLocation } from "./pickup-locations.service.js";
import { CANCELLABLE_SHIPMENT_STATUSES, recordShipmentEvents } from "./shipment-status.js";
import { HAND_TRACKED_CARRIERS, MANUAL_CARRIER, type ShipmentEventInput, type ShipmentRef, type ShippingProvider } from "./shipping-provider.js";
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

export function deriveParcel(
  items: Array<{
    quantity: number;
    unavailableQuantity: number;
    variant?: {
      weightGrams: number | null;
      lengthCm: Prisma.Decimal | null;
      breadthCm: Prisma.Decimal | null;
      heightCm: Prisma.Decimal | null;
    } | null;
  }>,
): { weightGrams: number; lengthCm: string; breadthCm: string; heightCm: string } {
  let totalWeightGrams = 0;
  let maxLength = 10;
  let maxBreadth = 10;
  let maxHeight = 10;

  for (const item of items) {
    const qty = item.quantity - item.unavailableQuantity;
    if (qty <= 0) continue;
    const v = item.variant;
    totalWeightGrams += (v?.weightGrams ?? 200) * qty;
    if (v?.lengthCm) maxLength = Math.max(maxLength, Number(v.lengthCm));
    if (v?.breadthCm) maxBreadth = Math.max(maxBreadth, Number(v.breadthCm));
    if (v?.heightCm) maxHeight = Math.max(maxHeight, Number(v.heightCm));
  }

  return {
    weightGrams: Math.min(Math.max(totalWeightGrams, 100), MAX_WEIGHT_GRAMS),
    lengthCm: String(Math.max(maxLength, 1)),
    breadthCm: String(Math.max(maxBreadth, 1)),
    heightCm: String(Math.max(maxHeight, 1)),
  };
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
  async function shipOrder(orderId: string, input: Partial<ShipOrderBody> = {}, actor: Actor) {
    let order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            variant: {
              select: { weightGrams: true, lengthCm: true, breadthCm: true, heightCm: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        shipment: { select: { status: true } },
      },
    });
    if (!order || order.status === OrderStatus.PENDING_PAYMENT) {
      throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
    }

    if (order.status === OrderStatus.CONFIRMED && !input.courierName) {
      await prisma.$transaction((tx) =>
        transitionOrder(tx, {
          orderId,
          allowedFrom: [OrderStatus.CONFIRMED],
          to: OrderStatus.PACKED,
          changedById: actor.userId,
          note: "Auto-packed for shipping",
        }),
      );
      order = { ...order, status: OrderStatus.PACKED };
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

    if (provider.name === MANUAL_CARRIER && (!input.courierName || !input.awb)) {
      throw new AppError(400, "COURIER_DETAILS_REQUIRED", "Manual shipping requires courier name and AWB number");
    }

    const derived = deriveParcel(order.items);
    const parcel = {
      weightGrams: input.weightGrams ?? derived.weightGrams,
      lengthCm: new Prisma.Decimal(input.lengthCm ?? derived.lengthCm),
      breadthCm: new Prisma.Decimal(input.breadthCm ?? derived.breadthCm),
      heightCm: new Prisma.Decimal(input.heightCm ?? derived.heightCm),
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
    if (provider.booksInApp) {
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
              description: [shipment.courierName, shipment.awb && `AWB ${shipment.awb}`].filter(Boolean).join(", ") || (provider.booksInApp ? "Shipment booked" : `Order pushed to ${provider.label}`),
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
    const provider = await providerFor(shipment.provider);

    if (provider.getShipmentDetails) {
      try {
        const details = await provider.getShipmentDetails(refOf(shipment));
        if (details) {
          const updates: Prisma.ShipmentUpdateInput = {};
          if (details.awb && details.awb !== shipment.awb) {
            updates.awb = details.awb;
          }
          if (details.courierName && details.courierName !== shipment.courierName) {
            updates.courierName = details.courierName;
          }
          if (details.trackingUrl && details.trackingUrl !== shipment.trackingUrl) {
            updates.trackingUrl = details.trackingUrl;
          } else if (details.awb && !shipment.trackingUrl) {
            updates.trackingUrl = `https://shiprocket.co/tracking/${encodeURIComponent(details.awb)}`;
          }
          if (details.labelUrl && details.labelUrl !== shipment.labelUrl) {
            updates.labelUrl = details.labelUrl;
          }
          if (Object.keys(updates).length > 0) {
            await prisma.shipment.update({ where: { id: shipment.id }, data: updates });
            Object.assign(shipment, updates);
          }
          if (details.status && details.status !== shipment.status && details.status !== ShipmentStatus.PENDING) {
            await prisma.$transaction((tx) =>
              recordShipmentEvents(tx, {
                orderId,
                shipmentId: shipment.id,
                changedById: null,
                events: [
                  {
                    status: details.status!,
                    providerEventId: `sync:${details.status}:${Date.now()}`,
                    occurredAt: new Date(),
                    location: null,
                    description: `Status updated to ${details.status} from ${provider.label}`,
                  },
                ],
              }),
            );
          }
        }
      } catch (err) {
        log.warn({ err, orderId, provider: shipment.provider }, "Failed to fetch shipment details from carrier");
      }
    }

    const events = await provider.track(refOf(shipment));
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
        OR: [{ awb: { not: null } }, { providerShipmentId: { not: null } }, { providerOrderId: { not: null } }],
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
          ...(webhook.providerOrderId ? [{ providerOrderId: webhook.providerOrderId }] : []),
          ...(webhook.orderNumber ? [{ order: { orderNumber: webhook.orderNumber } }] : []),
        ],
      },
      select: { id: true, orderId: true, awb: true, courierName: true, trackingUrl: true },
    });
    if (!shipment) {
      log.warn(
        { provider: provider.name, awb: webhook.awb, providerShipmentId: webhook.providerShipmentId, providerOrderId: webhook.providerOrderId, orderNumber: webhook.orderNumber },
        "Shipping webhook for an unknown shipment",
      );
      return;
    }

    const updates: Prisma.ShipmentUpdateInput = {};
    if (webhook.awb) {
      if (!shipment.awb || shipment.awb !== webhook.awb) {
        updates.awb = webhook.awb;
      }
      if (!shipment.trackingUrl && provider.name === "shiprocket") {
        updates.trackingUrl = `https://shiprocket.co/tracking/${encodeURIComponent(webhook.awb)}`;
      }
    }
    if (webhook.courierName && (!shipment.courierName || shipment.courierName !== webhook.courierName)) {
      updates.courierName = webhook.courierName;
    }
    if (Object.keys(updates).length > 0) {
      await prisma.shipment.update({ where: { id: shipment.id }, data: updates });
    }

    const event: ShipmentEventInput = webhook.event;
    await prisma.$transaction((tx) =>
      recordShipmentEvents(tx, { orderId: shipment.orderId, shipmentId: shipment.id, changedById: null, events: [event] }),
    );
  }

  /**
   * Pushes multiple orders to the carrier in bulk. Auto-packs confirmed orders and derives parcel
   * dimensions for each order.
   */
  async function bulkShipOrders(orderIds: string[], actor: Actor) {
    const results: Array<{ orderId: string; orderNumber?: string; success: boolean; error?: string }> = [];

    for (const orderId of orderIds) {
      try {
        const order = await prisma.order.findUnique({
          where: { id: orderId },
          select: { orderNumber: true, status: true, shipment: { select: { status: true } } },
        });

        if (!order) {
          results.push({ orderId, success: false, error: "Order not found" });
          continue;
        }

        if (order.shipment && order.shipment.status !== ShipmentStatus.CANCELLED) {
          results.push({ orderId, orderNumber: order.orderNumber, success: false, error: "Shipment already exists" });
          continue;
        }

        if (order.status !== OrderStatus.CONFIRMED && order.status !== OrderStatus.PACKED) {
          results.push({
            orderId,
            orderNumber: order.orderNumber,
            success: false,
            error: `Order is ${order.status}; must be CONFIRMED or PACKED`,
          });
          continue;
        }

        await shipOrder(orderId, {}, actor);
        results.push({ orderId, orderNumber: order.orderNumber, success: true });
      } catch (err: any) {
        log.warn({ err, orderId }, "Bulk ship failed for order");
        results.push({
          orderId,
          success: false,
          error: err?.message || "Failed to push shipment",
        });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    return {
      total: orderIds.length,
      succeeded,
      failed: orderIds.length - succeeded,
      results,
    };
  }

  /**
   * When autoPushShipment is enabled and a non-manual shipping carrier is configured, automatically
   * packs and pushes confirmed orders to the carrier without manual intervention.
   */
  async function autoPushIfEnabled(orderId: string) {
    const settings = await getPlatformSettings(prisma);
    if (!settings.autoPushShipment || !settings.shippingProvider || settings.shippingProvider === MANUAL_CARRIER) {
      return;
    }

    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { orderNumber: true, status: true, shipment: { select: { status: true } } },
      });

      if (!order) return;
      if (order.shipment && order.shipment.status !== ShipmentStatus.CANCELLED) return;
      if (order.status !== OrderStatus.CONFIRMED && order.status !== OrderStatus.PACKED) return;

      await shipOrder(orderId, {}, { userId: "system" });
      log.info({ orderId, orderNumber: order.orderNumber }, "Order auto-pushed to shipping carrier");
    } catch (error) {
      log.warn({ err: error, orderId }, "Auto-push order to carrier failed");
    }
  }

  return {
    shipOrder,
    bulkShipOrders,
    autoPushIfEnabled,
    cancelShipment,
    refreshLabel,
    addEvent,
    syncTracking,
    sweepTracking,
    handleWebhook,
  };
}

export type ShipmentsService = ReturnType<typeof createShipmentsService>;
