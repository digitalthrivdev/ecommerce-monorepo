import { StoreStatus, UserRole, type Prisma, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { ACTIVE_ORDER_STATUSES } from "../orders/order-status.js";
import { distanceKmSql } from "./geo.js";
import type { CreateStoreInput, UpdateStoreInput } from "./stores.schemas.js";

/** Operational counts shown to admins; customers only see the store itself. */
const adminCountsInclude = {
  _count: {
    select: {
      staff: { where: { role: UserRole.STORE_STAFF } },
      products: true,
      orders: { where: { status: { in: ACTIVE_ORDER_STATUSES } } },
    },
  },
} satisfies Prisma.StoreInclude;

type StoreWithCounts = Prisma.StoreGetPayload<{ include: typeof adminCountsInclude }>;

function withCounts({ _count, ...store }: StoreWithCounts) {
  return { ...store, staffCount: _count.staff, productCount: _count.products, activeOrderCount: _count.orders };
}

export function createStoresService(prisma: PrismaClient) {
  async function listStores(params: { limit: number; offset: number; includeInactive: boolean }) {
    const page = { orderBy: { name: "asc" }, take: params.limit, skip: params.offset } as const;

    if (params.includeInactive) {
      const [items, total] = await prisma.$transaction([
        prisma.store.findMany({ ...page, include: adminCountsInclude }),
        prisma.store.count(),
      ]);
      return { items: items.map(withCounts), total, limit: params.limit, offset: params.offset };
    }

    const where = { status: StoreStatus.ACTIVE };
    const [items, total] = await prisma.$transaction([
      prisma.store.findMany({ ...page, where }),
      prisma.store.count({ where }),
    ]);

    return { items, total, limit: params.limit, offset: params.offset };
  }

  async function getStore(id: string, options: { includeInactive: boolean }) {
    const store = options.includeInactive
      ? await prisma.store.findUnique({ where: { id }, include: adminCountsInclude }).then((found) => found && withCounts(found))
      : await prisma.store.findFirst({ where: { id, status: StoreStatus.ACTIVE } });

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
          ${distanceKmSql(latitude, longitude)} AS distance_km
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
