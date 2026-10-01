import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import type { CreateAddressInput, UpdateAddressInput } from "./addresses.schemas.js";

const MAX_ADDRESSES_PER_USER = 20;

// Serialises address writes per user so the count limit and single default stay consistent.
async function lockUser(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
}

export function createAddressesService(prisma: PrismaClient) {
  async function listAddresses(userId: string) {
    return prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      take: MAX_ADDRESSES_PER_USER,
    });
  }

  async function createAddress(userId: string, data: CreateAddressInput) {
    return prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      const count = await tx.address.count({ where: { userId } });

      if (count >= MAX_ADDRESSES_PER_USER) {
        throw new AppError(400, "ADDRESS_LIMIT", `You can save at most ${MAX_ADDRESSES_PER_USER} addresses`);
      }

      const isDefault = count === 0 || data.isDefault === true;

      if (isDefault) {
        await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
      }

      return tx.address.create({ data: { ...data, userId, isDefault } });
    });
  }

  async function updateAddress(userId: string, id: string, data: UpdateAddressInput) {
    return prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      const existing = await tx.address.findFirst({ where: { id, userId }, select: { id: true } });

      if (!existing) {
        throw new AppError(404, "ADDRESS_NOT_FOUND", "Address not found");
      }

      if (data.isDefault === true) {
        await tx.address.updateMany({
          where: { userId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }

      return tx.address.update({ where: { id }, data });
    });
  }

  async function deleteAddress(userId: string, id: string) {
    await prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      const existing = await tx.address.findFirst({ where: { id, userId }, select: { isDefault: true } });

      if (!existing) {
        throw new AppError(404, "ADDRESS_NOT_FOUND", "Address not found");
      }

      await tx.address.delete({ where: { id } });

      if (existing.isDefault) {
        const next = await tx.address.findFirst({
          where: { userId },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });

        if (next) {
          await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
        }
      }
    });
  }

  return { listAddresses, createAddress, updateAddress, deleteAddress };
}
