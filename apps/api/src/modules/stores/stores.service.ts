import { StoreStatus, UserRole, type Prisma, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { gstinMatchesState } from "../../shared/gst.js";
import { ACTIVE_ORDER_STATUSES } from "../orders/order-status.js";
import { distanceKmSql } from "./geo.js";
import { hoursOrder, hoursSelect, isStoreOpen, type OpeningHours } from "./store-hours.js";
import type { CreateStoreInput, StoreHoursInput, UpdateStoreInput } from "./stores.schemas.js";

const hoursInclude = { hours: { select: hoursSelect, orderBy: hoursOrder } } satisfies Prisma.StoreInclude;

/** Operational counts shown to admins; customers only see the store itself. */
const adminCountsInclude = {
  ...hoursInclude,
  _count: {
    select: {
      staff: { where: { role: UserRole.STORE_STAFF } },
      products: true,
      orders: { where: { status: { in: ACTIVE_ORDER_STATUSES } } },
    },
  },
} satisfies Prisma.StoreInclude;

type StoreWithCounts = Prisma.StoreGetPayload<{ include: typeof adminCountsInclude }>;

function withOpenState<T extends { hours: OpeningHours[] }>(store: T) {
  return { ...store, isOpen: isStoreOpen(store.hours) };
}

function withCounts({ _count, ...store }: StoreWithCounts) {
  return withOpenState({ ...store, staffCount: _count.staff, productCount: _count.products, activeOrderCount: _count.orders });
}

/** A GSTIN's first two digits are the state it is registered in. */
function assertGstinState(gstin: string | null | undefined, state: string) {
  if (gstin && !gstinMatchesState(gstin, state)) {
    throw new AppError(400, "GSTIN_STATE_MISMATCH", `This GSTIN is not registered in ${state}. Its first two digits are the state code.`, {
      field: "gstin",
    });
  }
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
      prisma.store.findMany({ ...page, where, include: hoursInclude }),
      prisma.store.count({ where }),
    ]);

    return { items: items.map(withOpenState), total, limit: params.limit, offset: params.offset };
  }

  async function getStore(id: string, options: { includeInactive: boolean }) {
    const store = options.includeInactive
      ? await prisma.store.findUnique({ where: { id }, include: adminCountsInclude }).then((found) => found && withCounts(found))
      : await prisma.store
          .findFirst({ where: { id, status: StoreStatus.ACTIVE }, include: hoursInclude })
          .then((found) => found && withOpenState(found));

    if (!store) {
      throw new AppError(404, "STORE_NOT_FOUND", "Store not found");
    }

    return store;
  }

  async function createStore(data: CreateStoreInput) {
    assertGstinState(data.gstin, data.state);
    return withOpenState(await prisma.store.create({ data, include: hoursInclude }));
  }

  async function updateStore(id: string, data: UpdateStoreInput) {
    const existing = await prisma.store.findUnique({ where: { id }, select: { id: true, gstin: true, state: true } });

    if (!existing) {
      throw new AppError(404, "STORE_NOT_FOUND", "Store not found");
    }
    assertGstinState(data.gstin === undefined ? existing.gstin : data.gstin, data.state ?? existing.state);

    return withOpenState(await prisma.store.update({ where: { id }, data, include: hoursInclude }));
  }

  /** Replaces the store's weekly hours. An empty list means the store is always open. */
  async function setStoreHours(id: string, hours: StoreHoursInput) {
    const existing = await prisma.store.findUnique({ where: { id }, select: { id: true } });

    if (!existing) {
      throw new AppError(404, "STORE_NOT_FOUND", "Store not found");
    }

    await prisma.$transaction([
      prisma.storeHours.deleteMany({ where: { storeId: id } }),
      prisma.storeHours.createMany({ data: hours.map((entry) => ({ ...entry, storeId: id })) }),
    ]);

    const saved = await prisma.storeHours.findMany({ where: { storeId: id }, select: hoursSelect, orderBy: hoursOrder });
    return { hours: saved, isOpen: isStoreOpen(saved) };
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

    const store = await prisma.store
      .findUnique({ where: { id: nearest.id }, include: hoursInclude })
      .then((found) => found && withOpenState(found));

    return {
      serviceable: store !== null,
      distanceKm: Math.round(nearest.distanceKm * 100) / 100,
      store,
    };
  }

  return { listStores, getStore, createStore, updateStore, setStoreHours, findServiceableStore };
}
