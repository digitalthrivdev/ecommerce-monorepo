import { OrderStatus, Prisma, UserRole, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import type { CustomerOrdersQuery, ListCustomersQuery } from "./customers.schemas.js";

type LastOrderRow = {
  userId: string;
  id: string;
  orderNumber: string;
  status: OrderStatus;
  total: Prisma.Decimal;
  createdAt: Date;
};

const customerSelect = { id: true, phone: true, name: true, email: true, createdAt: true } satisfies Prisma.UserSelect;

function notFound() {
  return new AppError(404, "CUSTOMER_NOT_FOUND", "Customer not found");
}

export function createCustomersService(prisma: PrismaClient) {
  /** Each customer's most recent order, via the (userId, createdAt) index. */
  async function lastOrders(userIds: string[]) {
    if (userIds.length === 0) return new Map<string, LastOrderRow>();

    const rows = await prisma.$queryRaw<LastOrderRow[]>`
      SELECT DISTINCT ON ("userId") "userId", id, "orderNumber", status, total, "createdAt"
      FROM "Order"
      WHERE "userId" IN (${Prisma.join(userIds)})
      ORDER BY "userId", "createdAt" DESC
    `;
    return new Map(rows.map((row) => [row.userId, row]));
  }

  async function listCustomers({ q, limit, offset }: ListCustomersQuery) {
    const where: Prisma.UserWhereInput = {
      role: UserRole.CUSTOMER,
      ...(q && {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      }),
    };

    const [rows, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        select: { ...customerSelect, _count: { select: { orders: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: limit,
        skip: offset,
      }),
      prisma.user.count({ where }),
    ]);

    const latest = await lastOrders(rows.map((row) => row.id));
    const items = rows.map(({ _count, ...customer }) => {
      const last = latest.get(customer.id);
      return {
        ...customer,
        orderCount: _count.orders,
        lastOrder: last
          ? { id: last.id, orderNumber: last.orderNumber, status: last.status, total: last.total.toFixed(2), createdAt: last.createdAt }
          : null,
      };
    });

    return { items, total, limit, offset };
  }

  async function getCustomer(id: string) {
    const customer = await prisma.user.findFirst({
      where: { id, role: UserRole.CUSTOMER },
      select: {
        ...customerSelect,
        addresses: {
          orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            label: true,
            name: true,
            phone: true,
            addressLine1: true,
            addressLine2: true,
            landmark: true,
            city: true,
            state: true,
            postalCode: true,
            latitude: true,
            longitude: true,
            isDefault: true,
          },
        },
      },
    });

    if (!customer) {
      throw notFound();
    }

    const [byStatus, last] = await Promise.all([
      prisma.order.groupBy({
        by: ["status"],
        where: { userId: id },
        orderBy: { status: "asc" },
        _count: { _all: true },
        _sum: { total: true },
      }),
      prisma.order.findFirst({ where: { userId: id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    ]);

    const countOf = (status: OrderStatus) => byStatus.find((row) => row.status === status)?._count._all ?? 0;
    const spent = byStatus.find((row) => row.status === OrderStatus.DELIVERED)?._sum.total ?? new Prisma.Decimal(0);

    return {
      ...customer,
      stats: {
        orders: byStatus.reduce((sum, row) => sum + row._count._all, 0),
        delivered: countOf(OrderStatus.DELIVERED),
        cancelled: countOf(OrderStatus.CANCELLED),
        /** Total of delivered orders only. */
        totalSpent: spent.toFixed(2),
        lastOrderAt: last?.createdAt ?? null,
      },
    };
  }

  async function listOrders(customerId: string, { limit, offset }: CustomerOrdersQuery) {
    const customer = await prisma.user.findFirst({ where: { id: customerId, role: UserRole.CUSTOMER }, select: { id: true } });

    if (!customer) {
      throw notFound();
    }

    const where = { userId: customerId };
    const [orders, total] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentMethod: true,
          total: true,
          createdAt: true,
          store: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
      }),
      prisma.order.count({ where }),
    ]);

    return {
      items: orders.map(({ _count, total: orderTotal, ...order }) => ({
        ...order,
        total: orderTotal.toFixed(2),
        itemCount: _count.items,
      })),
      total,
      limit,
      offset,
    };
  }

  return { listCustomers, getCustomer, listOrders };
}
