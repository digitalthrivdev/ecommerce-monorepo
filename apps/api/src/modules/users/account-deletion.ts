import { DeliveryPartnerStatus, OrderStatus, Prisma, UserRole, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { cashSummaries } from "../delivery/cash.service.js";
import { ACTIVE_DELIVERY_STATUSES } from "../delivery/partners.service.js";
import { ACTIVE_ORDER_STATUSES } from "../orders/order-status.js";

const OPEN_ORDER_STATUSES: OrderStatus[] = [OrderStatus.PENDING_PAYMENT, ...ACTIVE_ORDER_STATUSES];

/** Customers and riders can delete their accounts; dashboard accounts are removed by an admin. */
export const DELETABLE_ROLES: UserRole[] = [UserRole.CUSTOMER, UserRole.DELIVERY_PARTNER];

/** Shown instead of the phone number of a deleted account. Not a valid phone, so nobody can sign in with it. */
export const deletedPhone = (userId: string) => `deleted-${userId}`;

/**
 * Deletes a customer or rider account by wiping its personal details: name, email, phone,
 * addresses, cart and push tokens. Orders keep their snapshots (needed for GST records), and a
 * rider's deliveries, cash deposits and payouts stay for the accounts. The phone number is freed,
 * so it can sign up again as a new account. `revokeTokens` signs the user out on every device.
 */
export function createAccountDeletionService(prisma: PrismaClient, revokeTokens: (userId: string) => Promise<void>) {
  async function deleteAccount(userId: string, role: UserRole) {
    await prisma.$transaction(async (tx) => {
      const [user] = await tx.$queryRaw<{ role: UserRole; deletedAt: Date | null }[]>`
        SELECT role, "deletedAt" FROM "User" WHERE id = ${userId} FOR UPDATE
      `;
      if (!user || user.deletedAt || user.role !== role || !DELETABLE_ROLES.includes(role)) {
        throw new AppError(404, "ACCOUNT_NOT_FOUND", "Account not found");
      }

      if (role === UserRole.CUSTOMER) {
        const open = await tx.order.count({ where: { userId, status: { in: OPEN_ORDER_STATUSES } } });
        if (open > 0) {
          throw new AppError(
            409,
            "ORDER_IN_PROGRESS",
            "An order is still in progress. The account can be deleted once it is delivered or cancelled.",
          );
        }
      }

      if (role === UserRole.DELIVERY_PARTNER) {
        const [partner] = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "DeliveryPartner" WHERE "userId" = ${userId} FOR UPDATE
        `;
        if (partner) {
          const active = await tx.delivery.count({ where: { partnerId: partner.id, status: { in: ACTIVE_DELIVERY_STATUSES } } });
          if (active > 0) {
            throw new AppError(409, "DELIVERY_IN_PROGRESS", "A delivery is still in progress. Finish it or ask an admin to reassign it first.");
          }
          const cash = (await cashSummaries(tx, [partner.id])).get(partner.id);
          if (cash && new Prisma.Decimal(cash.inHand).gt(0)) {
            const amount = new Intl.NumberFormat("en-IN", { style: "currency", currency: cash.currency }).format(Number(cash.inHand));
            throw new AppError(409, "CASH_IN_HAND", `Hand over the ${amount} cash you hold before deleting the account.`, {
              inHand: cash.inHand,
            });
          }
          await tx.deliveryPartner.update({
            where: { id: partner.id },
            data: { isActive: false, status: DeliveryPartnerStatus.OFFLINE, vehicleType: null, vehicleNumber: null },
          });
        }
      }

      const cart = await tx.cart.findUnique({ where: { userId }, select: { id: true } });
      if (cart) {
        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
        await tx.cart.delete({ where: { id: cart.id } });
      }
      await tx.address.deleteMany({ where: { userId } });
      await tx.complaint.updateMany({ where: { userId }, data: { note: null, photoUrls: [] } });
      await tx.pushToken.deleteMany({ where: { userId } });
      await tx.user.update({
        where: { id: userId },
        data: { name: null, email: null, phone: deletedPhone(userId), passwordHash: null, deletedAt: new Date() },
      });
    });

    await revokeTokens(userId);
  }

  return { deleteAccount };
}
