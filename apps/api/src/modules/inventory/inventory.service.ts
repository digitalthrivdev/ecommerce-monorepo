import { InventoryAdjustmentReason, type Prisma, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { inCategory, variantLabel } from "../products/catalog.js";
import type { AdjustInventoryInput, ListAdjustmentsQuery, ListInventoryQuery } from "./inventory.schemas.js";

export type StockLine = { variantId: string; quantity: number };

/** Active variants at or below this quantity count as low stock. */
export const LOW_STOCK_THRESHOLD = 5;

const inventorySelect = {
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
  inventory: { select: { quantity: true, updatedAt: true } },
} satisfies Prisma.ProductVariantSelect;

type VariantWithInventory = Prisma.ProductVariantGetPayload<{ select: typeof inventorySelect }>;

function toView(variant: VariantWithInventory) {
  return {
    productId: variant.product.id,
    variantId: variant.id,
    name: variant.product.name,
    variantLabel: variantLabel(variant),
    sku: variant.sku,
    barcode: variant.barcode,
    slug: variant.product.slug,
    unit: variant.unit,
    packQuantity: variant.quantity?.toString() ?? null,
    category: variant.product.category,
    productIsActive: variant.product.isActive,
    variantIsActive: variant.isActive,
    stockQuantity: variant.inventory?.quantity ?? 0,
    stockUpdatedAt: variant.inventory?.updatedAt ?? null,
  };
}

function mergeLines(lines: StockLine[]) {
  const totals = new Map<string, number>();
  for (const line of lines) {
    totals.set(line.variantId, (totals.get(line.variantId) ?? 0) + line.quantity);
  }
  // Sorted so concurrent transactions lock rows in the same order and cannot deadlock.
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([variantId, quantity]) => ({ variantId, quantity }));
}

/**
 * Atomically decrements stock for every line, or throws INSUFFICIENT_STOCK and decrements nothing.
 * Must run inside the caller's transaction so a failure rolls back the earlier lines.
 */
export async function reserveStock(tx: Prisma.TransactionClient, lines: StockLine[]) {
  if (lines.some((line) => !Number.isInteger(line.quantity) || line.quantity <= 0)) {
    throw new AppError(400, "INVALID_QUANTITY", "Quantities must be positive integers");
  }

  const shortages: { variantId: string; requested: number; available: number }[] = [];

  for (const line of mergeLines(lines)) {
    const { count } = await tx.inventory.updateMany({
      where: { variantId: line.variantId, quantity: { gte: line.quantity } },
      data: { quantity: { decrement: line.quantity } },
    });

    if (count === 0) {
      const current = await tx.inventory.findUnique({
        where: { variantId: line.variantId },
        select: { quantity: true },
      });
      shortages.push({
        variantId: line.variantId,
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
      where: { variantId: line.variantId },
      update: { quantity: { increment: line.quantity } },
      create: { variantId: line.variantId, quantity: line.quantity },
    });
  }
}

/** Locks the stock row of a variant and returns its quantity (0 if it has none yet). */
async function lockStock(tx: Prisma.TransactionClient, variantId: string) {
  const [row] = await tx.$queryRaw<{ quantity: number }[]>`
    SELECT quantity FROM "Inventory" WHERE "variantId" = ${variantId} FOR UPDATE
  `;
  return row?.quantity ?? 0;
}

/**
 * Sets a variant's stock to an exact quantity and logs the change. Returns the quantity before.
 * Must run inside a transaction.
 */
export async function setStock(
  tx: Prisma.TransactionClient,
  variantId: string,
  quantity: number,
  details: { reason: InventoryAdjustmentReason; note: string | null; changedById: string | null },
) {
  const before = await lockStock(tx, variantId);
  await tx.inventory.upsert({
    where: { variantId },
    update: { quantity },
    create: { variantId, quantity },
  });
  if (quantity !== before) {
    await tx.inventoryAdjustment.create({
      data: { variantId, delta: quantity - before, quantityAfter: quantity, ...details },
    });
  }
  return before;
}

/**
 * Sets a variant's stock to 0 because the shelf turned out empty while picking, and logs it.
 * Must run inside a transaction.
 */
export async function clearStockAsUnavailable(
  tx: Prisma.TransactionClient,
  variantId: string,
  details: { note: string; changedById: string | null },
) {
  const before = await lockStock(tx, variantId);
  if (before === 0) return;

  await tx.inventory.update({ where: { variantId }, data: { quantity: 0 } });
  await tx.inventoryAdjustment.create({
    data: {
      variantId,
      delta: -before,
      quantityAfter: 0,
      reason: InventoryAdjustmentReason.ORDER_UNAVAILABLE,
      note: details.note,
      changedById: details.changedById,
    },
  });
}

export function createInventoryService(prisma: PrismaClient) {
  async function assertVariantExists(variantId: string) {
    const variant = await prisma.productVariant.findUnique({ where: { id: variantId }, select: { id: true } });

    if (!variant) {
      throw new AppError(404, "VARIANT_NOT_FOUND", "Variant not found");
    }
  }

  async function listInventory({ limit, offset, search, maxQuantity, isActive, categoryId, stock }: ListInventoryQuery) {
    const atMost = (quantity: number): Prisma.ProductVariantWhereInput => ({
      OR: [{ inventory: { is: { quantity: { lte: quantity } } } }, { inventory: { is: null } }],
    });

    const where: Prisma.ProductVariantWhereInput = {
      ...(isActive !== undefined && { isActive }),
      AND: [
        categoryId ? { product: inCategory(categoryId) } : {},
        search
          ? {
              OR: [
                { sku: { equals: search, mode: "insensitive" } },
                { barcode: search },
                { name: { contains: search, mode: "insensitive" } },
                { product: { name: { contains: search, mode: "insensitive" } } },
                { product: { brand: { name: { contains: search, mode: "insensitive" } } } },
              ],
            }
          : {},
        maxQuantity !== undefined ? atMost(maxQuantity) : {},
        stock === "low" ? { isActive: true, ...atMost(LOW_STOCK_THRESHOLD) } : {},
        stock === "out" ? atMost(0) : {},
      ],
    };

    const [rows, total] = await prisma.$transaction([
      prisma.productVariant.findMany({
        where,
        select: inventorySelect,
        orderBy: [{ product: { name: "asc" } }, { sortOrder: "asc" }],
        take: limit,
        skip: offset,
      }),
      prisma.productVariant.count({ where }),
    ]);

    return { items: rows.map(toView), total, limit, offset, lowStockThreshold: LOW_STOCK_THRESHOLD };
  }

  async function adjustInventory(variantId: string, input: AdjustInventoryInput, changedById: string) {
    await assertVariantExists(variantId);

    return prisma.$transaction(async (tx) => {
      const before = await lockStock(tx, variantId);

      let after: number;
      if ("quantity" in input) {
        after = input.quantity;
        await tx.inventory.upsert({
          where: { variantId },
          update: { quantity: after },
          create: { variantId, quantity: after },
        });
      } else if (input.delta > 0) {
        await releaseStock(tx, [{ variantId, quantity: input.delta }]);
        after = before + input.delta;
      } else {
        try {
          await reserveStock(tx, [{ variantId, quantity: -input.delta }]);
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
            variantId,
            delta: after - before,
            quantityAfter: after,
            reason: input.reason,
            note: input.note ?? null,
            changedById,
          },
        });
      }

      return toView(await tx.productVariant.findUniqueOrThrow({ where: { id: variantId }, select: inventorySelect }));
    });
  }

  async function listAdjustments(variantId: string, { limit, offset }: ListAdjustmentsQuery) {
    await assertVariantExists(variantId);
    const where = { variantId };

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
