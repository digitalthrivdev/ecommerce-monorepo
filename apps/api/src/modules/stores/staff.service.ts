import { UserRole, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";

const staffSelect = { id: true, phone: true, name: true, role: true, storeId: true, createdAt: true } as const;

export function createStaffService(prisma: PrismaClient) {
  async function assertStoreExists(storeId: string) {
    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });

    if (!store) {
      throw new AppError(404, "STORE_NOT_FOUND", "Store not found");
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

    return { items };
  }

  async function addStaff(storeId: string, phone: string, name?: string) {
    await assertStoreExists(storeId);

    const existing = await prisma.user.findUnique({
      where: { phone },
      select: { id: true, role: true, storeId: true },
    });

    if (!existing) {
      const user = await prisma.user.create({
        data: { phone, name, role: UserRole.STORE_STAFF, storeId },
        select: staffSelect,
      });
      return { created: true, user };
    }

    if (existing.role !== UserRole.STORE_STAFF) {
      throw new AppError(
        409,
        "USER_HAS_OTHER_ROLE",
        `This phone number belongs to a ${existing.role} account`,
      );
    }

    if (existing.storeId && existing.storeId !== storeId) {
      throw new AppError(409, "STAFF_ASSIGNED_ELSEWHERE", "This staff member already works at another store");
    }

    const user = await prisma.user.update({
      where: { id: existing.id },
      data: { storeId, ...(name && { name }) },
      select: staffSelect,
    });
    return { created: false, user };
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

  return { listStaff, addStaff, removeStaff };
}
