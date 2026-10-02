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
  storeId: true,
  passwordHash: true,
  createdAt: true,
} as const;

type StaffRow = Prisma.UserGetPayload<{ select: typeof staffSelect }>;

function toStaff({ passwordHash, ...user }: StaffRow) {
  return { ...user, hasPassword: passwordHash !== null };
}

export type AddStaffInput = { phone: string; email: string; password: string; name?: string };

export function createStaffService(prisma: PrismaClient) {
  async function assertStoreExists(storeId: string) {
    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });

    if (!store) {
      throw new AppError(404, "STORE_NOT_FOUND", "Store not found");
    }
  }

  async function assertEmailFree(email: string, userId?: string) {
    const owner = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (owner && owner.id !== userId) {
      throw new AppError(409, "EMAIL_IN_USE", "Another account already uses this email");
    }
  }

  async function listStaff(storeId: string) {
    await assertStoreExists(storeId);

    const items = await prisma.user.findMany({
      where: { storeId, role: UserRole.STORE_STAFF },
      select: staffSelect,
      orderBy: { createdAt: "asc" },
      take: 100,
    });

    return { items: items.map(toStaff) };
  }

  async function addStaff(storeId: string, { phone, email, password, name }: AddStaffInput) {
    await assertStoreExists(storeId);

    const existing = await prisma.user.findUnique({
      where: { phone },
      select: { id: true, role: true, storeId: true },
    });

    if (existing && existing.role !== UserRole.STORE_STAFF) {
      throw roleConflictError(existing.role);
    }
    if (existing?.storeId && existing.storeId !== storeId) {
      throw new AppError(409, "STAFF_ASSIGNED_ELSEWHERE", "This staff member already works at another store");
    }
    await assertEmailFree(email, existing?.id);

    const passwordHash = await hashPassword(password);

    if (!existing) {
      const user = await prisma.user.create({
        data: { phone, email, passwordHash, name, role: UserRole.STORE_STAFF, storeId },
        select: staffSelect,
      });
      return { created: true, user: toStaff(user) };
    }

    const user = await prisma.user.update({
      where: { id: existing.id },
      data: { storeId, email, passwordHash, ...(name && { name }) },
      select: staffSelect,
    });
    return { created: false, user: toStaff(user) };
  }

  async function setStaffPassword(storeId: string, userId: string, password: string) {
    const passwordHash = await hashPassword(password);
    const { count } = await prisma.user.updateMany({
      where: { id: userId, storeId, role: UserRole.STORE_STAFF },
      data: { passwordHash },
    });

    if (count === 0) {
      throw new AppError(404, "STAFF_NOT_FOUND", "Staff member not found at this store");
    }
  }

  async function removeStaff(storeId: string, userId: string) {
    const { count } = await prisma.user.updateMany({
      where: { id: userId, storeId, role: UserRole.STORE_STAFF },
      data: { storeId: null },
    });

    if (count === 0) {
      throw new AppError(404, "STAFF_NOT_FOUND", "Staff member not found at this store");
    }
  }

  return { listStaff, addStaff, setStaffPassword, removeStaff };
}
