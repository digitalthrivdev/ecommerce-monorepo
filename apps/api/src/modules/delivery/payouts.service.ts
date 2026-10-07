import { env } from "../../config/env.js";
import { Prisma, type PayoutMethod, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";

type Db = PrismaClient | Prisma.TransactionClient;

type BalanceRow = { id: string; earningsSince: Date; earned: Prisma.Decimal; paid: Prisma.Decimal };

function summarize({ earningsSince, earned, paid }: Omit<BalanceRow, "id">) {
  return {
    currency: env.CURRENCY,
    since: earningsSince,
    earned: earned.toFixed(2),
    paid: paid.toFixed(2),
    unpaid: earned.sub(paid).toFixed(2),
  };
}

export type EarningsSummary = ReturnType<typeof summarize>;

/** Delivery earnings since `earningsSince`, payouts that were not voided, and what is still owed. */
export async function earningsSummaries(db: Db, partnerIds: string[]) {
  if (partnerIds.length === 0) {
    return new Map<string, EarningsSummary>();
  }
  const rows = await db.$queryRaw<BalanceRow[]>`
    SELECT p.id, p."earningsSince", coalesce(e.total, 0) AS earned, coalesce(r.total, 0) AS paid
    FROM "DeliveryPartner" p
    LEFT JOIN LATERAL (
      SELECT sum(d.earning) AS total FROM "Delivery" d
      WHERE d."partnerId" = p.id AND d.status = 'DELIVERED' AND d."deliveredAt" >= p."earningsSince"
    ) e ON true
    LEFT JOIN LATERAL (
      SELECT sum(x.amount) AS total FROM "RiderPayout" x
      WHERE x."partnerId" = p.id AND x."voidedAt" IS NULL
    ) r ON true
    WHERE p.id IN (${Prisma.join(partnerIds)})
  `;
  return new Map(rows.map(({ id, ...row }) => [id, summarize(row)]));
}

const payoutSelect = {
  id: true,
  amount: true,
  method: true,
  note: true,
  paidAt: true,
  createdAt: true,
  voidedAt: true,
  voidReason: true,
  recordedBy: { select: { name: true } },
  voidedBy: { select: { name: true } },
} satisfies Prisma.RiderPayoutSelect;

type PayoutRow = Prisma.RiderPayoutGetPayload<{ select: typeof payoutSelect }>;

function toPayoutView({ amount, recordedBy, voidedBy, voidedAt, voidReason, ...payout }: PayoutRow) {
  return {
    ...payout,
    amount: amount.toFixed(2),
    recordedBy: recordedBy.name,
    voided: voidedAt ? { at: voidedAt, reason: voidReason, by: voidedBy?.name ?? null } : null,
  };
}

export type RecordPayoutInput = { amount: string; method: PayoutMethod; note?: string; paidAt?: Date };

export function createPayoutsService(prisma: PrismaClient) {
  async function summary(partnerId: string) {
    const earnings = (await earningsSummaries(prisma, [partnerId])).get(partnerId);
    if (!earnings) {
      throw new AppError(404, "PARTNER_NOT_FOUND", "Delivery partner not found");
    }
    return earnings;
  }

  /** Newest payment first, with the partner's earnings summary. */
  async function listPayouts(partnerId: string, { limit, offset }: { limit: number; offset: number }) {
    const earnings = await summary(partnerId);
    const where = { partnerId };
    const [rows, total] = await prisma.$transaction([
      prisma.riderPayout.findMany({
        where,
        select: payoutSelect,
        orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
        take: limit,
        skip: offset,
      }),
      prisma.riderPayout.count({ where }),
    ]);
    return { earnings, items: rows.map(toPayoutView), total, limit, offset };
  }

  async function recordPayout(partnerId: string, { amount, method, note, paidAt }: RecordPayoutInput, adminId: string) {
    const payout = await prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "DeliveryPartner" WHERE id = ${partnerId} FOR UPDATE
      `;
      if (!locked) {
        throw new AppError(404, "PARTNER_NOT_FOUND", "Delivery partner not found");
      }

      const earnings = (await earningsSummaries(tx, [partnerId])).get(partnerId)!;
      if (new Prisma.Decimal(amount).gt(earnings.unpaid)) {
        throw new AppError(409, "PAYOUT_EXCEEDS_UNPAID", `The rider is owed ${earnings.unpaid}`, { unpaid: earnings.unpaid });
      }

      return tx.riderPayout.create({
        data: { partnerId, amount, method, note, paidAt: paidAt ?? new Date(), recordedById: adminId },
        select: payoutSelect,
      });
    });

    return { payout: toPayoutView(payout), earnings: await summary(partnerId) };
  }

  async function voidPayout(payoutId: string, reason: string, adminId: string) {
    const existing = await prisma.riderPayout.findUnique({ where: { id: payoutId }, select: { partnerId: true } });
    if (!existing) {
      throw new AppError(404, "PAYOUT_NOT_FOUND", "Payout not found");
    }

    const { count } = await prisma.riderPayout.updateMany({
      where: { id: payoutId, voidedAt: null },
      data: { voidedAt: new Date(), voidedById: adminId, voidReason: reason },
    });
    if (count === 0) {
      throw new AppError(409, "PAYOUT_ALREADY_VOIDED", "This payout was already voided");
    }

    const payout = await prisma.riderPayout.findUniqueOrThrow({ where: { id: payoutId }, select: payoutSelect });
    return { payout: toPayoutView(payout), earnings: await summary(existing.partnerId) };
  }

  return { summary, listPayouts, recordPayout, voidPayout };
}
