import { env } from "../../config/env.js";
import { CouponDiscountType, OrderStatus, Prisma, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { dayOf, endOfDay, startOfDay } from "../../shared/time.js";
import type { CouponInput, ListCouponsQuery } from "./coupons.schemas.js";

type Db = PrismaClient | Prisma.TransactionClient;

export type CouponTerms = { discountType: CouponDiscountType; discountValue: Prisma.Decimal; maxDiscount: Prisma.Decimal | null };

/** The coupon's discount on an item subtotal, to the paisa and never more than the subtotal. */
export function couponDiscount(subtotal: Prisma.Decimal, terms: CouponTerms) {
  const raw =
    terms.discountType === CouponDiscountType.FLAT
      ? terms.discountValue
      : subtotal.mul(terms.discountValue).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const capped = terms.maxDiscount ? Prisma.Decimal.min(raw, terms.maxDiscount) : raw;
  return Prisma.Decimal.min(capped, subtotal);
}

const couponSelect = {
  id: true,
  code: true,
  description: true,
  discountType: true,
  discountValue: true,
  maxDiscount: true,
  minOrderValue: true,
  startsAt: true,
  endsAt: true,
  totalLimit: true,
  perCustomerLimit: true,
  firstOrderOnly: true,
  isActive: true,
  createdAt: true,
} satisfies Prisma.CouponSelect;

type CouponRow = Prisma.CouponGetPayload<{ select: typeof couponSelect }>;

const notCancelled = { status: { not: OrderStatus.CANCELLED } };

function money(amount: Prisma.Decimal) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: env.CURRENCY }).format(amount.toNumber());
}

function day(date: Date) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: env.TIMEZONE }).format(date);
}

/** Errors a customer can get for a coupon; the cart shows their message next to the code. */
export const COUPON_ERROR_CODES = [
  "COUPON_NOT_FOUND",
  "COUPON_NOT_STARTED",
  "COUPON_EXPIRED",
  "COUPON_USED_UP",
  "COUPON_LIMIT_REACHED",
  "COUPON_FIRST_ORDER_ONLY",
  "COUPON_MIN_ORDER",
];

/**
 * Checks that the customer can use the coupon on this item subtotal and returns it with the
 * discount. With `lock` (inside the order transaction) the coupon row is locked first, so its
 * limits are counted one order at a time.
 */
export async function checkCoupon(db: Db, { code, userId, subtotal, lock = false }: { code: string; userId: string; subtotal: Prisma.Decimal; lock?: boolean }) {
  if (lock) {
    await db.$queryRaw`SELECT id FROM "Coupon" WHERE code = ${code} FOR UPDATE`;
  }
  const coupon = await db.coupon.findUnique({ where: { code }, select: couponSelect });
  const now = new Date();

  if (!coupon || !coupon.isActive) {
    throw new AppError(404, "COUPON_NOT_FOUND", "This coupon code isn't valid");
  }
  if (coupon.startsAt && coupon.startsAt > now) {
    throw new AppError(409, "COUPON_NOT_STARTED", `This coupon can be used from ${day(coupon.startsAt)}`);
  }
  if (coupon.endsAt && coupon.endsAt <= now) {
    throw new AppError(409, "COUPON_EXPIRED", "This coupon has expired");
  }

  const [usedByAll, usedByCustomer, earlierOrders] = await Promise.all([
    coupon.totalLimit ? db.order.count({ where: { couponId: coupon.id, ...notCancelled } }) : 0,
    coupon.perCustomerLimit ? db.order.count({ where: { couponId: coupon.id, userId, ...notCancelled } }) : 0,
    coupon.firstOrderOnly ? db.order.count({ where: { userId, ...notCancelled } }) : 0,
  ]);
  if (coupon.totalLimit && usedByAll >= coupon.totalLimit) {
    throw new AppError(409, "COUPON_USED_UP", "This coupon has been fully used");
  }
  if (coupon.perCustomerLimit && usedByCustomer >= coupon.perCustomerLimit) {
    throw new AppError(409, "COUPON_LIMIT_REACHED", "You've already used this coupon");
  }
  if (coupon.firstOrderOnly && earlierOrders > 0) {
    throw new AppError(409, "COUPON_FIRST_ORDER_ONLY", "This coupon is only for your first order");
  }
  if (subtotal.lt(coupon.minOrderValue)) {
    throw new AppError(409, "COUPON_MIN_ORDER", `Add items worth ${money(coupon.minOrderValue.minus(subtotal))} more to use this coupon`, {
      minOrderValue: coupon.minOrderValue.toFixed(2),
    });
  }

  return { coupon, discount: couponDiscount(subtotal, coupon) };
}

type UsageRow = { couponId: string; used: bigint; orders: bigint; discountGiven: Prisma.Decimal | null };

function statusOf(coupon: CouponRow, used: number, now = new Date()) {
  if (!coupon.isActive) return "INACTIVE" as const;
  if (coupon.endsAt && coupon.endsAt <= now) return "EXPIRED" as const;
  if (coupon.totalLimit && used >= coupon.totalLimit) return "USED_UP" as const;
  if (coupon.startsAt && coupon.startsAt > now) return "SCHEDULED" as const;
  return "ACTIVE" as const;
}

function toView(coupon: CouponRow, usage: UsageRow | undefined) {
  const used = Number(usage?.used ?? 0);
  return {
    ...coupon,
    discountValue: coupon.discountValue.toFixed(2),
    maxDiscount: coupon.maxDiscount?.toFixed(2) ?? null,
    minOrderValue: coupon.minOrderValue.toFixed(2),
    startsOn: coupon.startsAt ? dayOf(coupon.startsAt) : null,
    // endsAt is the start of the day after the last one.
    endsOn: coupon.endsAt ? dayOf(new Date(coupon.endsAt.getTime() - 1)) : null,
    status: statusOf(coupon, used),
    /** Orders using it, not counting cancelled ones. */
    usedCount: used,
    /** Discount on delivered orders. */
    discountGiven: (usage?.discountGiven ?? new Prisma.Decimal(0)).toFixed(2),
    /** Used by an order (even a cancelled one): the code and discount can no longer change. */
    termsLocked: Number(usage?.orders ?? 0) > 0,
  };
}

async function usageOf(db: Db, couponIds: string[]) {
  if (couponIds.length === 0) return new Map<string, UsageRow>();
  const rows = await db.$queryRaw<UsageRow[]>`
    SELECT "couponId",
           count(*) FILTER (WHERE status <> 'CANCELLED') AS used,
           count(*) AS orders,
           sum(discount) FILTER (WHERE status = 'DELIVERED') AS "discountGiven"
    FROM "Order"
    WHERE "couponId" IN (${Prisma.join(couponIds)})
    GROUP BY "couponId"
  `;
  return new Map(rows.map((row) => [row.couponId, row]));
}

function toData(input: CouponInput) {
  const { startsOn, endsOn, ...rest } = input;
  return {
    ...rest,
    discountValue: new Prisma.Decimal(input.discountValue),
    maxDiscount: input.maxDiscount === null ? null : new Prisma.Decimal(input.maxDiscount),
    minOrderValue: new Prisma.Decimal(input.minOrderValue),
    startsAt: startsOn ? startOfDay(startsOn) : null,
    endsAt: endsOn ? endOfDay(endsOn) : null,
  };
}

const notFound = () => new AppError(404, "COUPON_NOT_FOUND", "Coupon not found");

export function createCouponsService(prisma: PrismaClient) {
  async function listCoupons({ q, limit, offset }: ListCouponsQuery) {
    const where: Prisma.CouponWhereInput = q ? { code: { contains: q.toUpperCase() } } : {};
    const [rows, total] = await prisma.$transaction([
      prisma.coupon.findMany({ where, select: couponSelect, orderBy: { createdAt: "desc" }, take: limit, skip: offset }),
      prisma.coupon.count({ where }),
    ]);
    const usage = await usageOf(prisma, rows.map((row) => row.id));
    return { items: rows.map((row) => toView(row, usage.get(row.id))), total, limit, offset };
  }

  async function getCoupon(id: string, db: Db = prisma) {
    const coupon = await db.coupon.findUnique({ where: { id }, select: couponSelect });
    if (!coupon) throw notFound();
    return toView(coupon, (await usageOf(db, [id])).get(id));
  }

  async function createCoupon(input: CouponInput) {
    const coupon = await prisma.coupon.create({ data: toData(input), select: { id: true } });
    return getCoupon(coupon.id);
  }

  async function updateCoupon(id: string, input: CouponInput) {
    const data = toData(input);
    await prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Coupon" WHERE id = ${id} FOR UPDATE`;
      if (!locked) throw notFound();

      const current = await tx.coupon.findUniqueOrThrow({ where: { id }, select: couponSelect });
      const termsChanged =
        current.code !== data.code ||
        current.discountType !== data.discountType ||
        !current.discountValue.eq(data.discountValue) ||
        (current.maxDiscount === null) !== (data.maxDiscount === null) ||
        (current.maxDiscount !== null && data.maxDiscount !== null && !current.maxDiscount.eq(data.maxDiscount));
      if (termsChanged && (await tx.order.count({ where: { couponId: id } })) > 0) {
        throw new AppError(
          409,
          "COUPON_TERMS_LOCKED",
          "Orders have used this coupon, so its code and discount can't change. Switch it off and create a new coupon instead.",
        );
      }
      await tx.coupon.update({ where: { id }, data });
    });
    return getCoupon(id);
  }

  return { listCoupons, getCoupon, createCoupon, updateCoupon };
}
