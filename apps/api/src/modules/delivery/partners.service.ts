import {
  DeliveryPartnerStatus,
  DeliveryStatus,
  Prisma,
  UserRole,
  type PrismaClient,
} from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { roleConflictError } from "../../shared/roles.js";
import { startOfTodaySql } from "../../shared/time.js";
import type { CreatePartnerInput, ListPartnersQuery, UpdatePartnerInput } from "./delivery.schemas.js";
import type { createTrackingService } from "./tracking.service.js";

type StatsRow = {
  todayDeliveries: bigint;
  todayEarnings: Prisma.Decimal | null;
  todayCashCollected: Prisma.Decimal | null;
  totalDeliveries: bigint;
  totalEarnings: Prisma.Decimal | null;
};

export const ACTIVE_DELIVERY_STATUSES: DeliveryStatus[] = [
  DeliveryStatus.ASSIGNED,
  DeliveryStatus.PICKED_UP,
  DeliveryStatus.OUT_FOR_DELIVERY,
];

const partnerInclude = {
  user: { select: { name: true, phone: true } },
  deliveries: {
    where: { status: { in: ACTIVE_DELIVERY_STATUSES } },
    select: { status: true, acceptedAt: true, order: { select: { id: true, orderNumber: true, status: true } } },
    take: 1,
  },
} satisfies Prisma.DeliveryPartnerInclude;

type PartnerRow = Prisma.DeliveryPartnerGetPayload<{ include: typeof partnerInclude }>;

type Tracking = ReturnType<typeof createTrackingService>;

export function createPartnersService(prisma: PrismaClient, tracking: Tracking) {
  async function toViews(rows: PartnerRow[]) {
    const locations = await tracking.getPartnerLocations(rows.map((row) => row.id));

    return rows.map((row) => {
      const active = row.deliveries[0];
      return {
        id: row.id,
        userId: row.userId,
        name: row.user.name,
        phone: row.user.phone,
        status: row.status,
        isActive: row.isActive,
        vehicleType: row.vehicleType,
        vehicleNumber: row.vehicleNumber,
        activeDelivery: active
          ? {
              orderId: active.order.id,
              orderNumber: active.order.orderNumber,
              orderStatus: active.order.status,
              accepted: active.acceptedAt !== null,
            }
          : null,
        lastLocation: locations.get(row.id) ?? null,
        createdAt: row.createdAt,
      };
    });
  }

  async function listPartners(query: ListPartnersQuery) {
    const search: Prisma.DeliveryPartnerWhereInput = query.q
      ? { user: { OR: [{ name: { contains: query.q, mode: "insensitive" } }, { phone: { contains: query.q } }] } }
      : {};
    const where: Prisma.DeliveryPartnerWhereInput = {
      ...search,
      ...(query.status && { status: query.status }),
      ...(query.isActive !== undefined && { isActive: query.isActive }),
    };

    const [rows, total, byStatus] = await prisma.$transaction([
      prisma.deliveryPartner.findMany({
        where,
        include: partnerInclude,
        // Busy, then online, then offline (enum order); deactivated partners last.
        orderBy: [{ isActive: "desc" }, { status: "desc" }, { createdAt: "asc" }],
        take: query.limit,
        skip: query.offset,
      }),
      prisma.deliveryPartner.count({ where }),
      prisma.deliveryPartner.groupBy({
        by: ["isActive", "status"],
        where: search,
        orderBy: [{ isActive: "asc" }, { status: "asc" }],
        _count: { _all: true },
      }),
    ]);

    const counts = { all: 0, online: 0, busy: 0, offline: 0, inactive: 0 };
    for (const row of byStatus) {
      const count = row._count._all;
      counts.all += count;
      if (!row.isActive) counts.inactive += count;
      else if (row.status === DeliveryPartnerStatus.ONLINE) counts.online += count;
      else if (row.status === DeliveryPartnerStatus.BUSY) counts.busy += count;
      else counts.offline += count;
    }

    return { items: await toViews(rows), total, limit: query.limit, offset: query.offset, counts };
  }

  async function getStats(partnerId: string) {
    const [row] = await prisma.$queryRaw<StatsRow[]>`
      SELECT
        count(*) FILTER (WHERE d."deliveredAt" >= ${startOfTodaySql()}) AS "todayDeliveries",
        sum(d.earning) FILTER (WHERE d."deliveredAt" >= ${startOfTodaySql()}) AS "todayEarnings",
        sum(o.total) FILTER (WHERE d."deliveredAt" >= ${startOfTodaySql()} AND o."paymentMethod" = 'COD') AS "todayCashCollected",
        count(*) AS "totalDeliveries",
        sum(d.earning) AS "totalEarnings"
      FROM "Delivery" d
      JOIN "Order" o ON o.id = d."orderId"
      WHERE d."partnerId" = ${partnerId} AND d.status = 'DELIVERED'
    `;
    const money = (value: Prisma.Decimal | null | undefined) => (value ?? new Prisma.Decimal(0)).toFixed(2);

    return {
      today: {
        deliveries: Number(row?.todayDeliveries ?? 0),
        earnings: money(row?.todayEarnings),
        cashCollected: money(row?.todayCashCollected),
      },
      allTime: { deliveries: Number(row?.totalDeliveries ?? 0), earnings: money(row?.totalEarnings) },
    };
  }

  async function getPartner(id: string) {
    const row = await prisma.deliveryPartner.findUnique({ where: { id }, include: partnerInclude });

    if (!row) {
      throw new AppError(404, "PARTNER_NOT_FOUND", "Delivery partner not found");
    }

    const [[view], stats] = await Promise.all([toViews([row]), getStats(id)]);
    return { ...view!, stats };
  }

  /** Every delivery assigned to the partner, newest first, for admin review. */
  async function listDeliveries(partnerId: string, { limit, offset }: { limit: number; offset: number }) {
    const partner = await prisma.deliveryPartner.findUnique({ where: { id: partnerId }, select: { id: true } });

    if (!partner) {
      throw new AppError(404, "PARTNER_NOT_FOUND", "Delivery partner not found");
    }

    const where = { partnerId };
    const [rows, total] = await prisma.$transaction([
      prisma.delivery.findMany({
        where,
        select: {
          id: true,
          status: true,
          assignedAt: true,
          pickedUpAt: true,
          deliveredAt: true,
          earning: true,
          order: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              paymentMethod: true,
              total: true,
              store: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.delivery.count({ where }),
    ]);

    const items = rows.map(({ earning, order: { total, ...order }, ...delivery }) => ({
      ...delivery,
      earning: earning?.toFixed(2) ?? null,
      order: { ...order, total: total.toFixed(2) },
    }));

    return { items, total, limit, offset };
  }

  async function createPartner({ phone, name, vehicleType, vehicleNumber }: CreatePartnerInput) {
    const existing = await prisma.user.findUnique({
      where: { phone },
      select: { id: true, role: true, deliveryPartner: { select: { id: true } } },
    });

    if (existing && existing.role !== UserRole.DELIVERY_PARTNER) {
      throw roleConflictError(existing.role);
    }

    if (existing?.deliveryPartner) {
      throw new AppError(409, "PARTNER_EXISTS", "This phone number is already a delivery partner", {
        partnerId: existing.deliveryPartner.id,
      });
    }

    const partner = await prisma.$transaction(async (tx) => {
      const user = existing
        ? await tx.user.update({ where: { id: existing.id }, data: { ...(name && { name }) } })
        : await tx.user.create({ data: { phone, name, role: UserRole.DELIVERY_PARTNER } });

      return tx.deliveryPartner.create({
        data: { userId: user.id, vehicleType, vehicleNumber },
        select: { id: true },
      });
    });

    return getPartner(partner.id);
  }

  async function updatePartner(id: string, { name, isActive, ...vehicle }: UpdatePartnerInput) {
    await prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ status: DeliveryPartnerStatus; userId: string }[]>`
        SELECT status, "userId" FROM "DeliveryPartner" WHERE id = ${id} FOR UPDATE
      `;

      if (!locked) {
        throw new AppError(404, "PARTNER_NOT_FOUND", "Delivery partner not found");
      }

      if (isActive === false && locked.status === DeliveryPartnerStatus.BUSY) {
        throw new AppError(409, "PARTNER_BUSY", "Reassign or finish the partner's active delivery first");
      }

      await tx.deliveryPartner.update({
        where: { id },
        data: {
          ...vehicle,
          ...(isActive !== undefined && { isActive }),
          ...(isActive === false && { status: DeliveryPartnerStatus.OFFLINE }),
        },
      });

      if (name) {
        await tx.user.update({ where: { id: locked.userId }, data: { name } });
      }
    });

    return getPartner(id);
  }

  return { listPartners, getPartner, listDeliveries, createPartner, updatePartner };
}
