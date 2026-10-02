import { InventoryAdjustmentReason, type Prisma, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { inCategory, variantLabel } from "../products/catalog.js";
import type { AdjustInventoryInput, ListAdjustmentsQuery, ListInventoryQuery } from "./inventory.schemas.js";

export type StockLine = { storeProductId: string; quantity: number };

/** Available products at or below this quantity count as low stock. */
export const LOW_STOCK_THRESHOLD = 5;

const inventoryInclude = {
  variant: {
    select: {
      id: true,
      sku: true,
      barcode: true,
      name: true,
      unit: true,
      quantity: true,
      isActive: true,
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
          category: { select: { id: true, name: true } },
        },
      },
    },
  },
  inventory: { select: { quantity: true, updatedAt: true } },
} satisfies Prisma.StoreProductInclude;

type StoreProductWithInventory = Prisma.StoreProductGetPayload<{ include: typeof inventoryInclude }>;

function toView(row: StoreProductWithInventory) {
  const { variant } = row;
  return {
    productId: variant.product.id,
    variantId: variant.id,
    storeProductId: row.id,
    name: variant.product.name,
    variantLabel: variantLabel(variant),
    sku: variant.sku,
    barcode: variant.barcode,
    slug: variant.product.slug,
    unit: variant.unit,
    packQuantity: variant.quantity?.toString() ?? null,
    category: variant.product.category,
    isAvailable: row.isAvailable,
    productIsActive: variant.product.isActive,
    variantIsActive: variant.isActive,
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

/** Locks the stock row of a listing and returns its quantity (0 if it has none yet). */
async function lockStock(tx: Prisma.TransactionClient, storeProductId: string) {
  const [row] = await tx.$queryRaw<{ quantity: number }[]>`
    SELECT quantity FROM "Inventory" WHERE "storeProductId" = ${storeProductId} FOR UPDATE
  `;
  return row?.quantity ?? 0;
}

/**
 * Sets a listing's stock to 0 because the shelf turned out empty while picking, and logs it.
 * Must run inside a transaction.
 */
export async function clearStockAsUnavailable(
  tx: Prisma.TransactionClient,
  storeProductId: string,
  details: { note: string; changedById: string | null },
) {
  const before = await lockStock(tx, storeProductId);
  if (before === 0) return;

  await tx.inventory.update({ where: { storeProductId }, data: { quantity: 0 } });
  await tx.inventoryAdjustment.create({
    data: {
      storeProductId,
      delta: -before,
      quantityAfter: 0,
      reason: InventoryAdjustmentReason.ORDER_UNAVAILABLE,
      note: details.note,
      changedById: details.changedById,
    },
  });
}

export function createInventoryService(prisma: PrismaClient) {
  async function assertStoreExists(storeId: string) {
    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });

    if (!store) {
      throw new AppError(404, "STORE_NOT_FOUND", "Store not found");
    }
  }

  async function findListing(storeId: string, variantId: string) {
    const storeProduct = await prisma.storeProduct.findUnique({
      where: { storeId_variantId: { storeId, variantId } },
      select: { id: true },
    });

    if (!storeProduct) {
      throw new AppError(404, "STORE_PRODUCT_NOT_FOUND", "Variant is not listed at this store");
    }

    return storeProduct;
  }

  async function listInventory(
    storeId: string,
    { limit, offset, search, maxQuantity, isAvailable, categoryId, stock }: ListInventoryQuery,
  ) {
    await assertStoreExists(storeId);

    const atMost = (quantity: number): Prisma.StoreProductWhereInput => ({
      OR: [{ inventory: { quantity: { lte: quantity } } }, { inventory: { is: null } }],
    });

    const where: Prisma.StoreProductWhereInput = {
      storeId,
      ...(isAvailable !== undefined && { isAvailable }),
      AND: [
        categoryId ? { variant: { product: inCategory(categoryId) } } : {},
        search
          ? {
              OR: [
                { variant: { sku: { equals: search, mode: "insensitive" } } },
                { variant: { barcode: search } },
                { variant: { name: { contains: search, mode: "insensitive" } } },
                { variant: { product: { name: { contains: search, mode: "insensitive" } } } },
                { variant: { product: { brand: { name: { contains: search, mode: "insensitive" } } } } },
              ],
            }
          : {},
        maxQuantity !== undefined ? atMost(maxQuantity) : {},
        stock === "low" ? { isAvailable: true, ...atMost(LOW_STOCK_THRESHOLD) } : {},
        stock === "out" ? atMost(0) : {},
      ],
    };

    const [rows, total] = await prisma.$transaction([
      prisma.storeProduct.findMany({
        where,
        include: inventoryInclude,
        orderBy: [{ variant: { product: { name: "asc" } } }, { variant: { sortOrder: "asc" } }],
        take: limit,
        skip: offset,
      }),
      prisma.storeProduct.count({ where }),
    ]);

    return { items: rows.map(toView), total, limit, offset, lowStockThreshold: LOW_STOCK_THRESHOLD };
  }

  async function adjustInventory(storeId: string, variantId: string, input: AdjustInventoryInput, changedById: string) {
    const storeProduct = await findListing(storeId, variantId);

    return prisma.$transaction(async (tx) => {
      const before = await lockStock(tx, storeProduct.id);

      let after: number;
      if ("quantity" in input) {
        after = input.quantity;
        await tx.inventory.upsert({
          where: { storeProductId: storeProduct.id },
          update: { quantity: after },
          create: { storeProductId: storeProduct.id, quantity: after },
        });
      } else if (input.delta > 0) {
        await releaseStock(tx, [{ storeProductId: storeProduct.id, quantity: input.delta }]);
        after = before + input.delta;
      } else {
        try {
          await reserveStock(tx, [{ storeProductId: storeProduct.id, quantity: -input.delta }]);
        } catch (error) {
          if (error instanceof AppError && error.code === "INSUFFICIENT_STOCK") {
            throw new AppError(409, "INSUFFICIENT_STOCK", "Adjustment would make stock negative", error.details);
          }
          throw error;
        }
        after = before + input.delta;
      }

      if (after !== before) {
        await tx.inventoryAdjustment.create({
          data: {
            storeProductId: storeProduct.id,
            delta: after - before,
            quantityAfter: after,
            reason: input.reason,
            note: input.note ?? null,
            changedById,
          },
        });
      }

      const updated = await tx.storeProduct.findUniqueOrThrow({
        where: { id: storeProduct.id },
        include: inventoryInclude,
      });

      return toView(updated);
    });
  }

  async function listAdjustments(storeId: string, variantId: string, { limit, offset }: ListAdjustmentsQuery) {
    const storeProduct = await findListing(storeId, variantId);
    const where = { storeProductId: storeProduct.id };

    const [rows, total] = await prisma.$transaction([
      prisma.inventoryAdjustment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: { id: true, delta: true, quantityAfter: true, reason: true, note: true, changedById: true, createdAt: true },
      }),
      prisma.inventoryAdjustment.count({ where }),
    ]);

    // changedById has no relation (the person may be deleted later), so names are looked up here.
    const userIds = [...new Set(rows.flatMap((row) => row.changedById ?? []))];
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
      : [];
    const byId = new Map(users.map((user) => [user.id, user]));

    return {
      items: rows.map(({ changedById, ...row }) => {
        const user = changedById ? byId.get(changedById) : undefined;
        return { ...row, changedBy: user ? { id: user.id, name: user.name ?? user.email } : null };
      }),
      total,
      limit,
      offset,
    };
  }

  return { listInventory, adjustInventory, listAdjustments };
}
