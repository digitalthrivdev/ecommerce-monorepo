import { Prisma, StoreStatus, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { customerVisible } from "../products/store-products.service.js";
import { MAX_QUANTITY_PER_ITEM, type AddCartItemInput } from "./cart.schemas.js";

type CartItemIssue = "UNAVAILABLE" | "OUT_OF_STOCK" | "INSUFFICIENT_STOCK";

const cartInclude = {
  store: { select: { id: true, name: true, code: true, status: true } },
  items: {
    include: {
      product: { select: { id: true, name: true, slug: true, imageUrl: true, unit: true, quantity: true } },
    },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.CartInclude;

type Tx = Prisma.TransactionClient;

export async function lockCart(tx: Tx, cartId: string) {
  await tx.$queryRaw`SELECT id FROM "Cart" WHERE id = ${cartId} FOR UPDATE`;
}

async function getSellableStock(tx: Tx, storeId: string, productId: string) {
  const storeProduct = await tx.storeProduct.findFirst({
    where: { storeId, productId, ...customerVisible, store: { status: StoreStatus.ACTIVE } },
    select: { inventory: { select: { quantity: true } } },
  });

  if (!storeProduct) {
    throw new AppError(404, "PRODUCT_NOT_AVAILABLE", "Product is not available at this store");
  }

  return storeProduct.inventory?.quantity ?? 0;
}

function assertEnoughStock(requested: number, available: number) {
  if (requested > MAX_QUANTITY_PER_ITEM) {
    throw new AppError(
      400,
      "QUANTITY_LIMIT",
      `You can add at most ${MAX_QUANTITY_PER_ITEM} of an item`,
      { maxQuantity: MAX_QUANTITY_PER_ITEM },
    );
  }

  if (requested > available) {
    throw new AppError(409, "INSUFFICIENT_STOCK", "Not enough stock for the requested quantity", {
      requested,
      available,
    });
  }
}

export function createCartService(prisma: PrismaClient) {
  async function getCart(userId: string) {
    const cart = await prisma.cart.findUnique({ where: { userId }, include: cartInclude });

    if (!cart || !cart.storeId || cart.items.length === 0) {
      return {
        id: cart?.id ?? null,
        store: null,
        items: [],
        itemCount: 0,
        subtotal: "0.00",
        isValid: false,
      };
    }

    const storeIsActive = cart.store?.status === StoreStatus.ACTIVE;

    const storeProducts = await prisma.storeProduct.findMany({
      where: {
        storeId: cart.storeId,
        productId: { in: cart.items.map((item) => item.productId) },
        ...customerVisible,
      },
      select: { productId: true, sellingPrice: true, mrp: true, inventory: { select: { quantity: true } } },
    });
    const byProductId = new Map(storeProducts.map((sp) => [sp.productId, sp]));

    let subtotal = new Prisma.Decimal(0);

    const items = cart.items.map((item) => {
      const storeProduct = storeIsActive ? byProductId.get(item.productId) : undefined;
      const available = storeProduct?.inventory?.quantity ?? 0;

      let issue: CartItemIssue | null = null;
      if (!storeProduct) issue = "UNAVAILABLE";
      else if (available === 0) issue = "OUT_OF_STOCK";
      else if (item.quantity > available) issue = "INSUFFICIENT_STOCK";

      const lineTotal = storeProduct ? storeProduct.sellingPrice.mul(item.quantity) : null;
      if (lineTotal && !issue) {
        subtotal = subtotal.add(lineTotal);
      }

      return {
        id: item.id,
        productId: item.productId,
        name: item.product.name,
        slug: item.product.slug,
        imageUrl: item.product.imageUrl,
        unit: item.product.unit,
        packQuantity: item.product.quantity,
        quantity: item.quantity,
        unitPrice: storeProduct?.sellingPrice.toFixed(2) ?? null,
        mrp: storeProduct?.mrp?.toFixed(2) ?? null,
        lineTotal: lineTotal?.toFixed(2) ?? null,
        issue,
        ...(issue === "INSUFFICIENT_STOCK" && { availableQuantity: available }),
      };
    });

    return {
      id: cart.id,
      store: cart.store,
      items,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      subtotal: subtotal.toFixed(2),
      isValid: storeIsActive && items.every((item) => item.issue === null),
    };
  }

  async function ensureCart(userId: string) {
    try {
      return await prisma.cart.upsert({
        where: { userId },
        update: {},
        create: { userId },
        select: { id: true },
      });
    } catch (error) {
      // A concurrent request created the cart first.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return prisma.cart.findUniqueOrThrow({ where: { userId }, select: { id: true } });
      }
      throw error;
    }
  }

  async function addItem(userId: string, { storeId, productId, quantity }: AddCartItemInput) {
    const cart = await ensureCart(userId);

    await prisma.$transaction(async (tx) => {
      await lockCart(tx, cart.id);

      const current = await tx.cart.findUniqueOrThrow({
        where: { id: cart.id },
        select: { storeId: true, _count: { select: { items: true } } },
      });

      if (current._count.items > 0 && current.storeId !== storeId) {
        throw new AppError(
          409,
          "STORE_MISMATCH",
          "Your cart has items from another store. Clear the cart to shop from this store.",
          { cartStoreId: current.storeId },
        );
      }

      const available = await getSellableStock(tx, storeId, productId);

      const existing = await tx.cartItem.findUnique({
        where: { cartId_productId: { cartId: cart.id, productId } },
        select: { quantity: true },
      });
      const newQuantity = (existing?.quantity ?? 0) + quantity;
      assertEnoughStock(newQuantity, available);

      if (current.storeId !== storeId) {
        await tx.cart.update({ where: { id: cart.id }, data: { storeId } });
      }

      await tx.cartItem.upsert({
        where: { cartId_productId: { cartId: cart.id, productId } },
        update: { quantity: newQuantity },
        create: { cartId: cart.id, productId, quantity: newQuantity },
      });
    });

    return getCart(userId);
  }

  async function findOwnItem(tx: Tx, userId: string, itemId: string) {
    const item = await tx.cartItem.findFirst({
      where: { id: itemId, cart: { userId } },
      select: { id: true, cartId: true, productId: true, cart: { select: { storeId: true } } },
    });

    if (!item) {
      throw new AppError(404, "CART_ITEM_NOT_FOUND", "Cart item not found");
    }

    return item;
  }

  async function updateItem(userId: string, itemId: string, quantity: number) {
    await prisma.$transaction(async (tx) => {
      const item = await findOwnItem(tx, userId, itemId);
      await lockCart(tx, item.cartId);

      const available = await getSellableStock(tx, item.cart.storeId!, item.productId);
      assertEnoughStock(quantity, available);

      await tx.cartItem.update({ where: { id: item.id }, data: { quantity } });
    });

    return getCart(userId);
  }

  async function removeItem(userId: string, itemId: string) {
    await prisma.$transaction(async (tx) => {
      const item = await findOwnItem(tx, userId, itemId);
      await lockCart(tx, item.cartId);

      await tx.cartItem.delete({ where: { id: item.id } });

      const remaining = await tx.cartItem.count({ where: { cartId: item.cartId } });
      if (remaining === 0) {
        await tx.cart.update({ where: { id: item.cartId }, data: { storeId: null } });
      }
    });

    return getCart(userId);
  }

  async function clearCart(userId: string) {
    await prisma.$transaction(async (tx) => {
      const cart = await tx.cart.findUnique({ where: { userId }, select: { id: true } });
      if (!cart) return;

      await lockCart(tx, cart.id);
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      await tx.cart.update({ where: { id: cart.id }, data: { storeId: null } });
    });

    return getCart(userId);
  }

  return { getCart, addItem, updateItem, removeItem, clearCart };
}
