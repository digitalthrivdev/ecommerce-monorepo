import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import type { AdjustInventoryInput, ListInventoryQuery } from "./inventory.schemas.js";

export type StockLine = { storeProductId: string; quantity: number };

const inventoryInclude = {
  product: { select: { id: true, name: true, slug: true, unit: true, quantity: true, isActive: true } },
  inventory: { select: { quantity: true, updatedAt: true } },
} satisfies Prisma.StoreProductInclude;

type StoreProductWithInventory = Prisma.StoreProductGetPayload<{ include: typeof inventoryInclude }>;

function toView(row: StoreProductWithInventory) {
  return {
    productId: row.product.id,
    storeProductId: row.id,
    name: row.product.name,
    slug: row.product.slug,
    unit: row.product.unit,
    packQuantity: row.product.quantity,
    isAvailable: row.isAvailable,
    productIsActive: row.product.isActive,
    stockQuantity: row.inventory?.quantity ?? 0,
    stockUpdatedAt: row.inventory?.updatedAt ?? null,
  };
}

function mergeLines(lines: StockLine[]) {
  const totals = new Map<string, number>();
  for (const line of lines) {
    totals.set(line.storeProductId, (totals.get(line.storeProductId) ?? 0) + line.quantity);
  }
  // Sorted so concurrent transactions lock rows in the same order and cannot deadlock.
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([storeProductId, quantity]) => ({ storeProductId, quantity }));
}

/**
 * Atomically decrements stock for every line, or throws INSUFFICIENT_STOCK and decrements nothing.
 * Must run inside the caller's transaction so a failure rolls back the earlier lines.
 */
export async function reserveStock(tx: Prisma.TransactionClient, lines: StockLine[]) {
  if (lines.some((line) => !Number.isInteger(line.quantity) || line.quantity <= 0)) {
    throw new AppError(400, "INVALID_QUANTITY", "Quantities must be positive integers");
  }

  const shortages: { storeProductId: string; requested: number; available: number }[] = [];

  for (const line of mergeLines(lines)) {
    const { count } = await tx.inventory.updateMany({
      where: { storeProductId: line.storeProductId, quantity: { gte: line.quantity } },
      data: { quantity: { decrement: line.quantity } },
    });

    if (count === 0) {
      const current = await tx.inventory.findUnique({
        where: { storeProductId: line.storeProductId },
        select: { quantity: true },
      });
      shortages.push({
        storeProductId: line.storeProductId,
        requested: line.quantity,
        available: current?.quantity ?? 0,
      });
    }
  }

  if (shortages.length > 0) {
    throw new AppError(409, "INSUFFICIENT_STOCK", "Some items do not have enough stock", shortages);
  }
}

/** Returns previously reserved stock, e.g. when an order is cancelled. */
export async function releaseStock(tx: Prisma.TransactionClient, lines: StockLine[]) {
  for (const line of mergeLines(lines)) {
    await tx.inventory.upsert({
      where: { storeProductId: line.storeProductId },
      update: { quantity: { increment: line.quantity } },
      create: { storeProductId: line.storeProductId, quantity: line.quantity },
    });
  }
}

export function createInventoryService(prisma: PrismaClient) {
  async function assertStoreExists(storeId: string) {
    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });

    if (!store) {
      throw new AppError(404, "STORE_NOT_FOUND", "Store not found");
    }
  }

  async function listInventory(storeId: string, { limit, offset, search, maxQuantity }: ListInventoryQuery) {
    await assertStoreExists(storeId);

    const where: Prisma.StoreProductWhereInput = {
      storeId,
      ...(search && { product: { name: { contains: search, mode: "insensitive" } } }),
      ...(maxQuantity !== undefined && {
        OR: [{ inventory: { quantity: { lte: maxQuantity } } }, { inventory: { is: null } }],
      }),
    };

    const [rows, total] = await prisma.$transaction([
      prisma.storeProduct.findMany({
        where,
        include: inventoryInclude,
        orderBy: { product: { name: "asc" } },
        take: limit,
        skip: offset,
      }),
      prisma.storeProduct.count({ where }),
    ]);

    return { items: rows.map(toView), total, limit, offset };
  }

  async function adjustInventory(storeId: string, productId: string, input: AdjustInventoryInput) {
    return prisma.$transaction(async (tx) => {
      const storeProduct = await tx.storeProduct.findUnique({
        where: { storeId_productId: { storeId, productId } },
        select: { id: true },
      });

      if (!storeProduct) {
        throw new AppError(404, "STORE_PRODUCT_NOT_FOUND", "Product is not listed at this store");
      }

      if ("quantity" in input) {
        await tx.inventory.upsert({
          where: { storeProductId: storeProduct.id },
          update: { quantity: input.quantity },
          create: { storeProductId: storeProduct.id, quantity: input.quantity },
        });
      } else if (input.delta > 0) {
        await releaseStock(tx, [{ storeProductId: storeProduct.id, quantity: input.delta }]);
      } else {
        try {
          await reserveStock(tx, [{ storeProductId: storeProduct.id, quantity: -input.delta }]);
        } catch (error) {
          if (error instanceof AppError && error.code === "INSUFFICIENT_STOCK") {
            throw new AppError(409, "INSUFFICIENT_STOCK", "Adjustment would make stock negative", error.details);
          }
          throw error;
        }
      }

      const updated = await tx.storeProduct.findUniqueOrThrow({
        where: { id: storeProduct.id },
        include: inventoryInclude,
      });

      return toView(updated);
    });
  }

  return { listInventory, adjustInventory };
}
