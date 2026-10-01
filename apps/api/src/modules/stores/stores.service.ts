import { StoreStatus, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import type { CreateStoreInput, UpdateStoreInput } from "./stores.schemas.js";

export function createStoresService(prisma: PrismaClient) {
  async function listStores(params: { limit: number; offset: number; includeInactive: boolean }) {
    const where = params.includeInactive ? {} : { status: StoreStatus.ACTIVE };

    const [items, total] = await prisma.$transaction([
      prisma.store.findMany({
        where,
        orderBy: { name: "asc" },
        take: params.limit,
        skip: params.offset,
      }),
      prisma.store.count({ where }),
    ]);

    return { items, total, limit: params.limit, offset: params.offset };
  }

  async function getStore(id: string, options: { includeInactive: boolean }) {
    const store = await prisma.store.findFirst({
      where: options.includeInactive ? { id } : { id, status: StoreStatus.ACTIVE },
    });

    if (!store) {
      throw new AppError(404, "STORE_NOT_FOUND", "Store not found");
    }

    return store;
  }

  async function createStore(data: CreateStoreInput) {
    return prisma.store.create({ data });
  }

  async function updateStore(id: string, data: UpdateStoreInput) {
    const existing = await prisma.store.findUnique({ where: { id }, select: { id: true } });

    if (!existing) {
      throw new AppError(404, "STORE_NOT_FOUND", "Store not found");
    }

    return prisma.store.update({ where: { id }, data });
  }

  async function findServiceableStore(latitude: number, longitude: number) {
    const [nearest] = await prisma.$queryRaw<{ id: string; distanceKm: number }[]>`
      SELECT id, distance_km AS "distanceKm"
      FROM (
        SELECT
          id,
          "serviceRadiusKm"::float8 AS radius_km,
          2 * 6371 * asin(least(1, sqrt(
            power(sin(radians(latitude::float8 - ${latitude}) / 2), 2) +
            cos(radians(${latitude})) * cos(radians(latitude::float8)) *
            power(sin(radians(longitude::float8 - ${longitude}) / 2), 2)
          ))) AS distance_km
        FROM "Store"
        WHERE status = 'ACTIVE'
      ) candidates
      WHERE distance_km <= radius_km
      ORDER BY distance_km
      LIMIT 1
    `;

    if (!nearest) {
      return { serviceable: false, distanceKm: null, store: null };
    }

    const store = await prisma.store.findUnique({ where: { id: nearest.id } });

    return {
      serviceable: store !== null,
      distanceKm: Math.round(nearest.distanceKm * 100) / 100,
      store,
    };
  }

  return { listStores, getStore, createStore, updateStore, findServiceableStore };
}
