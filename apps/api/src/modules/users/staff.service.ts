import { Prisma, UserRole, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { hashPassword } from "../../shared/password.js";
import { roleConflictError } from "../../shared/roles.js";

const staffSelect = {
  id: true,
  phone: true,
  email: true,
  name: true,
  role: true,
  isTestAccount: true,
  createdAt: true,
} as const;

/** Staff who can sign in. Removed staff keep their account (orders and stock logs name them) without a password. */
const currentStaff = { role: UserRole.STAFF, passwordHash: { not: null } } satisfies Prisma.UserWhereInput;

export type AddStaffInput = { phone: string; email: string; password: string; name?: string };

export function createStaffService(prisma: PrismaClient, revokeTokens: (userId: string) => Promise<void>) {
  async function assertEmailFree(email: string, userId?: string) {
    const owner = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (owner && owner.id !== userId) {
      throw new AppError(409, "EMAIL_IN_USE", "Another account already uses this email");
    }
  }

  async function listStaff() {
    const items = await prisma.user.findMany({
      where: currentStaff,
      select: staffSelect,
      orderBy: { createdAt: "asc" },
      take: 100,
    });

    return { items };
  }

  /** Adds a staff member, or gives a removed one access again with the new email and password. */
  async function addStaff({ phone, email, password, name }: AddStaffInput) {
    const existing = await prisma.user.findUnique({
      where: { phone },
      select: { id: true, role: true },
    });

    if (existing && existing.role !== UserRole.STAFF) {
      throw roleConflictError(existing.role);
    }
    await assertEmailFree(email, existing?.id);

    const passwordHash = await hashPassword(password);

    if (!existing) {
      const user = await prisma.user.create({
        data: { phone, email, passwordHash, name, role: UserRole.STAFF },
        select: staffSelect,
      });
      return { created: true, user };
    }

    const user = await prisma.user.update({
      where: { id: existing.id },
      data: { email, passwordHash, ...(name && { name }) },
      select: staffSelect,
    });
    return { created: false, user };
  }

  async function setStaffPassword(userId: string, password: string) {
    const passwordHash = await hashPassword(password);
    const { count } = await prisma.user.updateMany({ where: { id: userId, ...currentStaff }, data: { passwordHash } });

    if (count === 0) {
      throw new AppError(404, "STAFF_NOT_FOUND", "Staff member not found");
    }
  }

  /** Takes away dashboard access at once: the password is cleared and every session signed out. */
  async function removeStaff(userId: string) {
    const { count } = await prisma.user.updateMany({ where: { id: userId, ...currentStaff }, data: { passwordHash: null } });

    if (count === 0) {
      throw new AppError(404, "STAFF_NOT_FOUND", "Staff member not found");
    }
    await revokeTokens(userId);
  }

  return { listStaff, addStaff, setStaffPassword, removeStaff };
}
