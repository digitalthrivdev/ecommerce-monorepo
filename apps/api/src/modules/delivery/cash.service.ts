import { env } from "../../config/env.js";
import { Prisma, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { getPlatformSettings } from "../settings/settings.service.js";

type Db = PrismaClient | Prisma.TransactionClient;

type BalanceRow = { id: string; collected: Prisma.Decimal; deposited: Prisma.Decimal };

/**
 * Cash-on-delivery totals the partner delivered since `cashSince`, and the deposits that were not voided.
 * Cash in hand is the difference.
 */
const balanceJoins = Prisma.sql`
  LEFT JOIN LATERAL (
    SELECT sum(o.total) AS total
    FROM "Delivery" d JOIN "Order" o ON o.id = d."orderId"
    WHERE d."partnerId" = p.id AND d.status = 'DELIVERED' AND o."paymentMethod" = 'COD' AND d."deliveredAt" >= p."cashSince"
  ) col ON true
  LEFT JOIN LATERAL (
    SELECT sum(c.amount) AS total
    FROM "CashDeposit" c
    WHERE c."partnerId" = p.id AND c."voidedAt" IS NULL
  ) dep ON true
`;

const ZERO = new Prisma.Decimal(0);

function summarize(collected: Prisma.Decimal, deposited: Prisma.Decimal, limit: Prisma.Decimal | null) {
  const inHand = collected.sub(deposited);
  return {
    currency: env.CURRENCY,
    inHand: inHand.toFixed(2),
    collected: collected.toFixed(2),
    deposited: deposited.toFixed(2),
    limit: limit?.toFixed(2) ?? null,
    limitReached: limit !== null && inHand.gte(limit),
  };
}

export type CashSummary = ReturnType<typeof summarize>;

/** Cash summary per partner id; partners that don't exist are left out. */
export async function cashSummaries(db: Db, partnerIds: string[]) {
  if (partnerIds.length === 0) {
    return new Map<string, CashSummary>();
  }
  const [rows, settings] = await Promise.all([
    db.$queryRaw<BalanceRow[]>`
      SELECT p.id, coalesce(col.total, 0) AS collected, coalesce(dep.total, 0) AS deposited
      FROM "DeliveryPartner" p
      ${balanceJoins}
      WHERE p.id IN (${Prisma.join(partnerIds)})
    `,
    getPlatformSettings(db),
  ]);
  return new Map(rows.map((row) => [row.id, summarize(row.collected, row.deposited, settings.riderCashLimit)]));
}

/** Call inside the assignment transaction, after locking the partner row. */
export async function assertUnderCashLimit(tx: Prisma.TransactionClient, partnerId: string) {
  const cash = (await cashSummaries(tx, [partnerId])).get(partnerId);
  if (cash?.limitReached) {
    throw new AppError(
      409,
      "PARTNER_CASH_LIMIT",
      `This rider is holding ${cash.inHand} in cash. Record their deposit before assigning new orders.`,
      { inHand: cash.inHand, limit: cash.limit },
    );
  }
}

const depositSelect = {
  id: true,
  amount: true,
  note: true,
  createdAt: true,
  voidedAt: true,
  voidReason: true,
  store: { select: { id: true, name: true } },
  recordedBy: { select: { name: true } },
  voidedBy: { select: { name: true } },
} satisfies Prisma.CashDepositSelect;

type DepositRow = Prisma.CashDepositGetPayload<{ select: typeof depositSelect }>;

function toDepositView({ amount, recordedBy, voidedBy, voidedAt, voidReason, ...deposit }: DepositRow) {
  return {
    ...deposit,
    amount: amount.toFixed(2),
    recordedBy: recordedBy.name,
    voided: voidedAt ? { at: voidedAt, reason: voidReason, by: voidedBy?.name ?? null } : null,
  };
}

type ListRow = {
  id: string;
  name: string | null;
  phone: string;
  status: string;
  isActive: boolean;
  collected: Prisma.Decimal;
  deposited: Prisma.Decimal;
  lastDepositAt: Date | null;
  total: bigint;
  totalInHand: Prisma.Decimal;
};

/** `storeId` is where the deposit is handed over: the staff member's store, or null for an admin. */
export type Recorder = { userId: string; storeId: string | null };

export function createCashService(prisma: PrismaClient) {
  async function requirePartner(partnerId: string) {
    const partner = await prisma.deliveryPartner.findUnique({
      where: { id: partnerId },
      select: { id: true, status: true, isActive: true, cashSince: true, user: { select: { name: true, phone: true } } },
    });
    if (!partner) {
      throw new AppError(404, "PARTNER_NOT_FOUND", "Delivery partner not found");
    }
    return partner;
  }

  async function summary(partnerId: string) {
    return (await cashSummaries(prisma, [partnerId])).get(partnerId)!;
  }

  async function listDeposits(partnerId: string, { limit, offset }: { limit: number; offset: number }) {
    const where = { partnerId };
    const [rows, total] = await prisma.$transaction([
      prisma.cashDeposit.findMany({ where, select: depositSelect, orderBy: { createdAt: "desc" }, take: limit, skip: offset }),
      prisma.cashDeposit.count({ where }),
    ]);
    return { items: rows.map(toDepositView), total, limit, offset };
  }

  /** Every partner with their cash in hand, most cash first, so whoever should deposit is at the top. */
  async function listPartners({ q, limit, offset }: { q?: string; limit: number; offset: number }) {
    const search = q ? Prisma.sql`AND (u.name ILIKE ${`%${q}%`} OR u.phone LIKE ${`%${q}%`})` : Prisma.empty;
    const [rows, settings] = await Promise.all([
      prisma.$queryRaw<ListRow[]>`
        WITH balances AS (
          SELECT p.id, u.name, u.phone, p.status::text AS status, p."isActive",
            coalesce(col.total, 0) AS collected, coalesce(dep.total, 0) AS deposited,
            (SELECT max(c."createdAt") FROM "CashDeposit" c WHERE c."partnerId" = p.id AND c."voidedAt" IS NULL) AS "lastDepositAt"
          FROM "DeliveryPartner" p
          JOIN "User" u ON u.id = p."userId"
          ${balanceJoins}
          WHERE true ${search}
        )
        SELECT *, count(*) OVER () AS total, sum(collected - deposited) OVER () AS "totalInHand"
        FROM balances
        ORDER BY collected - deposited DESC, "isActive" DESC, name ASC NULLS LAST, id
        LIMIT ${limit} OFFSET ${offset}
      `,
      getPlatformSettings(prisma),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        phone: row.phone,
        status: row.status,
        isActive: row.isActive,
        lastDepositAt: row.lastDepositAt,
        cash: summarize(row.collected, row.deposited, settings.riderCashLimit),
      })),
      total: Number(rows[0]?.total ?? 0),
      totalInHand: (rows[0]?.totalInHand ?? ZERO).toFixed(2),
      cashLimit: settings.riderCashLimit?.toFixed(2) ?? null,
      currency: env.CURRENCY,
      limit,
      offset,
    };
  }

  async function getPartner(partnerId: string) {
    const partner = await requirePartner(partnerId);
    return {
      id: partner.id,
      name: partner.user.name,
      phone: partner.user.phone,
      status: partner.status,
      isActive: partner.isActive,
      cashSince: partner.cashSince,
      cash: await summary(partnerId),
    };
  }

  async function recordDeposit(partnerId: string, { amount, note }: { amount: string; note?: string }, recorder: Recorder) {
    const deposit = await prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "DeliveryPartner" WHERE id = ${partnerId} FOR UPDATE
      `;
      if (!locked) {
        throw new AppError(404, "PARTNER_NOT_FOUND", "Delivery partner not found");
      }

      const cash = (await cashSummaries(tx, [partnerId])).get(partnerId)!;
      if (new Prisma.Decimal(amount).gt(cash.inHand)) {
        throw new AppError(409, "DEPOSIT_EXCEEDS_CASH", `The rider only has ${cash.inHand} in hand`, {
          inHand: cash.inHand,
        });
      }

      return tx.cashDeposit.create({
        data: { partnerId, amount, note, storeId: recorder.storeId, recordedById: recorder.userId },
        select: depositSelect,
      });
    });

    return { deposit: toDepositView(deposit), cash: await summary(partnerId) };
  }

  async function voidDeposit(depositId: string, reason: string, adminId: string) {
    const existing = await prisma.cashDeposit.findUnique({ where: { id: depositId }, select: { partnerId: true } });
    if (!existing) {
      throw new AppError(404, "DEPOSIT_NOT_FOUND", "Deposit not found");
    }

    const { count } = await prisma.cashDeposit.updateMany({
      where: { id: depositId, voidedAt: null },
      data: { voidedAt: new Date(), voidedById: adminId, voidReason: reason },
    });
    if (count === 0) {
      throw new AppError(409, "DEPOSIT_ALREADY_VOIDED", "This deposit was already voided");
    }

    const deposit = await prisma.cashDeposit.findUniqueOrThrow({ where: { id: depositId }, select: depositSelect });
    return { deposit: toDepositView(deposit), cash: await summary(existing.partnerId) };
  }

  return { requirePartner, summary, listDeposits, listPartners, getPartner, recordDeposit, voidDeposit };
}
