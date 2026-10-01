import {
  DeliveryPartnerStatus,
  DeliveryStatus,
  Prisma,
  UserRole,
  type PrismaClient,
} from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import type { CreatePartnerInput, UpdatePartnerInput } from "./delivery.schemas.js";
import type { createTrackingService } from "./tracking.service.js";

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

  async function listPartners(query: {
    limit: number;
    offset: number;
    status?: DeliveryPartnerStatus;
    isActive?: boolean;
  }) {
    const where: Prisma.DeliveryPartnerWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.isActive !== undefined && { isActive: query.isActive }),
    };

    const [rows, total] = await prisma.$transaction([
      prisma.deliveryPartner.findMany({
        where,
        include: partnerInclude,
        orderBy: { createdAt: "asc" },
        take: query.limit,
        skip: query.offset,
      }),
      prisma.deliveryPartner.count({ where }),
    ]);

    return { items: await toViews(rows), total, limit: query.limit, offset: query.offset };
  }

  async function getPartner(id: string) {
    const row = await prisma.deliveryPartner.findUnique({ where: { id }, include: partnerInclude });

    if (!row) {
      throw new AppError(404, "PARTNER_NOT_FOUND", "Delivery partner not found");
    }

    const [view] = await toViews([row]);
    return view!;
  }

  async function createPartner({ phone, name, vehicleType, vehicleNumber }: CreatePartnerInput) {
    const existing = await prisma.user.findUnique({
      where: { phone },
      select: { id: true, role: true, deliveryPartner: { select: { id: true } } },
    });

    if (existing && existing.role !== UserRole.DELIVERY_PARTNER) {
      throw new AppError(409, "USER_HAS_OTHER_ROLE", `This phone number belongs to a ${existing.role} account`);
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

  return { listPartners, getPartner, createPartner, updatePartner };
}
