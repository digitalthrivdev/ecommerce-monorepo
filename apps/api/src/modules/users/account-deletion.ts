import { OrderStatus, UserRole, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { ACTIVE_ORDER_STATUSES } from "../orders/order-status.js";

const OPEN_ORDER_STATUSES: OrderStatus[] = [OrderStatus.PENDING_PAYMENT, ...ACTIVE_ORDER_STATUSES];

/** Customers can delete their accounts; dashboard accounts are removed by an admin. */
export const DELETABLE_ROLES: UserRole[] = [UserRole.CUSTOMER];

/** Shown instead of the phone number of a deleted account. Not a valid phone, so nobody can sign in with it. */
export const deletedPhone = (userId: string) => `deleted-${userId}`;

/**
 * Deletes a customer account by wiping its personal details: name, email, phone, addresses, cart,
 * wishlist and push tokens. Orders keep their snapshots (needed for GST records). The phone number is
 * freed, so it can sign up again as a new account. `revokeTokens` signs the user out on every device.
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

      const open = await tx.order.count({ where: { userId, status: { in: OPEN_ORDER_STATUSES } } });
      if (open > 0) {
        throw new AppError(
          409,
          "ORDER_IN_PROGRESS",
          "An order is still in progress. The account can be deleted once it is delivered or cancelled.",
        );
      }

      const cart = await tx.cart.findUnique({ where: { userId }, select: { id: true } });
      if (cart) {
        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
        await tx.cart.delete({ where: { id: cart.id } });
      }
      await tx.address.deleteMany({ where: { userId } });
      await tx.wishlistItem.deleteMany({ where: { userId } });
      await tx.complaint.updateMany({ where: { userId }, data: { note: null, photoUrls: [] } });
      await tx.orderRating.updateMany({ where: { order: { userId } }, data: { comment: null } });
      await tx.productReview.updateMany({ where: { userId }, data: { comment: null } });
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
