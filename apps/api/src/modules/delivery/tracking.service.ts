import type Redis from "ioredis";

import { DeliveryStatus, OrderStatus, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import type { LocationInput } from "./delivery.schemas.js";

const LOCATION_TTL_SECONDS = 10 * 60;
const PERSIST_EVERY_SECONDS = 60;
const AVERAGE_SPEED_KMPH = 20;
const ROAD_FACTOR = 1.3;
const HANDOVER_MINUTES = 2;

const TRACKABLE_STATUSES: OrderStatus[] = [
  OrderStatus.ASSIGNED,
  OrderStatus.PICKED_UP,
  OrderStatus.OUT_FOR_DELIVERY,
];

export type PartnerLocation = LocationInput & { updatedAt: string };

const locationKey = (partnerId: string) => `partner:location:${partnerId}`;
const persistGateKey = (deliveryId: string) => `delivery:location-persisted:${deliveryId}`;

type Point = { latitude: number; longitude: number };

function distanceKm(a: Point, b: Point) {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function travelMinutes(km: number) {
  return (km * ROAD_FACTOR * 60) / AVERAGE_SPEED_KMPH;
}

export function createTrackingService(prisma: PrismaClient, redis: Redis) {
  async function getPartnerLocations(partnerIds: string[]) {
    if (partnerIds.length === 0) {
      return new Map<string, PartnerLocation>();
    }

    const values = await redis.mget(partnerIds.map(locationKey));
    return new Map(
      partnerIds.flatMap((id, index) => {
        const value = values[index];
        return value ? [[id, JSON.parse(value) as PartnerLocation] as const] : [];
      }),
    );
  }

  /**
   * Latest position lives in Redis. While a delivery is in progress, one point per minute is also
   * persisted as history.
   */
  async function recordLocation(partnerId: string, input: LocationInput) {
    const location: PartnerLocation = { ...input, updatedAt: new Date().toISOString() };
    await redis.set(locationKey(partnerId), JSON.stringify(location), "EX", LOCATION_TTL_SECONDS);

    const delivery = await prisma.delivery.findFirst({
      where: {
        partnerId,
        status: { in: [DeliveryStatus.ASSIGNED, DeliveryStatus.PICKED_UP, DeliveryStatus.OUT_FOR_DELIVERY] },
        acceptedAt: { not: null },
      },
      select: { id: true },
    });

    if (!delivery) {
      return;
    }

    const shouldPersist = await redis.set(persistGateKey(delivery.id), "1", "EX", PERSIST_EVERY_SECONDS, "NX");
    if (shouldPersist) {
      await prisma.deliveryLocation.create({
        data: { deliveryId: delivery.id, latitude: input.latitude, longitude: input.longitude },
      });
    }
  }

  async function getCustomerTracking(userId: string, orderId: string) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId },
      select: {
        status: true,
        latitude: true,
        longitude: true,
        store: { select: { latitude: true, longitude: true } },
        delivery: {
          select: {
            status: true,
            partnerId: true,
            partner: { select: { vehicleType: true, vehicleNumber: true, user: { select: { name: true, phone: true } } } },
          },
        },
      },
    });

    if (!order) {
      throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
    }

    const store = { latitude: order.store.latitude.toNumber(), longitude: order.store.longitude.toNumber() };
    const destination =
      order.latitude && order.longitude
        ? { latitude: order.latitude.toNumber(), longitude: order.longitude.toNumber() }
        : null;
    const trackable = TRACKABLE_STATUSES.includes(order.status) && !!order.delivery?.partnerId;

    let partnerLocation: PartnerLocation | null = null;
    let distanceToCustomerKm: number | null = null;
    let etaMinutes: number | null = null;

    if (trackable) {
      partnerLocation = (await getPartnerLocations([order.delivery!.partnerId!])).get(order.delivery!.partnerId!) ?? null;

      if (partnerLocation && destination) {
        if (order.status === OrderStatus.ASSIGNED) {
          const toStore = distanceKm(partnerLocation, store);
          const storeToCustomer = distanceKm(store, destination);
          distanceToCustomerKm = toStore + storeToCustomer;
          etaMinutes = Math.ceil(travelMinutes(toStore) + HANDOVER_MINUTES + travelMinutes(storeToCustomer));
        } else {
          distanceToCustomerKm = distanceKm(partnerLocation, destination);
          etaMinutes = Math.max(1, Math.ceil(travelMinutes(distanceToCustomerKm)));
        }
      }
    }

    const partner = order.delivery?.partner;
    return {
      orderStatus: order.status,
      deliveryStatus: order.delivery?.status ?? null,
      trackable,
      partner:
        trackable && partner
          ? { name: partner.user.name, phone: partner.user.phone, vehicleType: partner.vehicleType, vehicleNumber: partner.vehicleNumber }
          : null,
      partnerLocation: partnerLocation && {
        latitude: partnerLocation.latitude,
        longitude: partnerLocation.longitude,
        heading: partnerLocation.heading ?? null,
        updatedAt: partnerLocation.updatedAt,
      },
      store,
      destination,
      distanceKm: distanceToCustomerKm === null ? null : Number(distanceToCustomerKm.toFixed(2)),
      etaMinutes,
    };
  }

  return { recordLocation, getPartnerLocations, getCustomerTracking };
}
