import { CustomerBlock, PaymentMethod, type Prisma, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { activePaymentProvider } from "../payments/gateway-registry.js";
import type { PlatformSettings } from "../settings/settings.service.js";

type Db = PrismaClient | Prisma.TransactionClient;

/** Why cash on delivery can't be used: the customer is blocked from it, or the total is over the limit. */
export type CodUnavailable = "BLOCKED" | "LIMIT";

export async function customerOrderBlock(db: Db, userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { orderBlock: true } });
  return user?.orderBlock ?? null;
}

export function codUnavailable(settings: PlatformSettings, total: Prisma.Decimal, block: CustomerBlock | null): CodUnavailable | null {
  if (block !== null) return "BLOCKED";
  if (settings.codMaxOrderValue !== null && total.gt(settings.codMaxOrderValue)) return "LIMIT";
  return null;
}

/** What the customer can do at checkout for this total; shown with the cart. */
export async function checkoutOptions(prisma: PrismaClient, settings: PlatformSettings, total: Prisma.Decimal, block: CustomerBlock | null) {
  const blocked = block === CustomerBlock.ALL;
  const cod = codUnavailable(settings, total, block);
  const online = !blocked && (await activePaymentProvider(prisma, settings)) !== null;
  return {
    blocked,
    paymentMethods: [...(cod === null ? [PaymentMethod.COD] : []), ...(online ? [PaymentMethod.ONLINE] : [])],
    codUnavailable: cod,
    codMaxOrderValue: settings.codMaxOrderValue?.toFixed(2) ?? null,
  };
}

export function assertCanOrder(block: CustomerBlock | null) {
  if (block === CustomerBlock.ALL) {
    throw new AppError(403, "ORDERING_BLOCKED", "Your account can't place orders. Please contact support.");
  }
}

export function assertCodAllowed(settings: PlatformSettings, total: Prisma.Decimal, block: CustomerBlock | null) {
  const reason = codUnavailable(settings, total, block);
  if (reason === "BLOCKED") {
    throw new AppError(403, "COD_NOT_ALLOWED", "Cash on delivery isn't available for your account. Please pay online.");
  }
  if (reason === "LIMIT") {
    throw new AppError(400, "COD_LIMIT_EXCEEDED", `Cash on delivery is available for orders up to ${settings.codMaxOrderValue!.toFixed(2)}. Please pay online.`, {
      codMaxOrderValue: settings.codMaxOrderValue!.toFixed(2),
      total: total.toFixed(2),
    });
  }
}
