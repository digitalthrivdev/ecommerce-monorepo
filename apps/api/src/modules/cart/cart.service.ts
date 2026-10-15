import { Prisma, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { checkCoupon, COUPON_ERROR_CODES } from "../coupons/coupons.service.js";
import { checkoutOptions, customerOrderBlock } from "../orders/checkout-rules.js";
import { customerVisibleVariant, imageOrder, imagesFor, maxOrderQuantity, variantLabel } from "../products/catalog.js";
import { calculateCharges, getPlatformSettings } from "../settings/settings.service.js";
import type { AddCartItemInput } from "./cart.schemas.js";

type CartItemIssue = "UNAVAILABLE" | "OUT_OF_STOCK" | "INSUFFICIENT_STOCK" | "QUANTITY_LIMIT";

const cartInclude = {
  items: {
    include: {
      variant: {
        select: {
          id: true,
          name: true,
          unit: true,
          quantity: true,
          maxOrderQuantity: true,
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              images: { orderBy: imageOrder, select: { url: true, variantId: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.CartInclude;

type Tx = Prisma.TransactionClient;

export async function lockCart(tx: Tx, cartId: string) {
  await tx.$queryRaw`SELECT id FROM "Cart" WHERE id = ${cartId} FOR UPDATE`;
}

/** Stock and per-order limit of a variant customers can buy. */
async function getSellableStock(tx: Tx, variantId: string) {
  const variant = await tx.productVariant.findFirst({
    where: { id: variantId, ...customerVisibleVariant },
    select: { maxOrderQuantity: true, inventory: { select: { quantity: true } } },
  });

  if (!variant) {
    throw new AppError(404, "PRODUCT_NOT_AVAILABLE", "Product is not available");
  }

  return { available: variant.inventory?.quantity ?? 0, limit: maxOrderQuantity(variant) };
}

function assertEnoughStock(requested: number, { available, limit }: { available: number; limit: number }) {
  if (requested > limit) {
    throw new AppError(400, "QUANTITY_LIMIT", `You can add at most ${limit} of this item`, { maxQuantity: limit });
  }

  if (requested > available) {
    throw new AppError(409, "INSUFFICIENT_STOCK", "Not enough stock for the requested quantity", {
      requested,
      available,
    });
  }
}

export function createCartService(prisma: PrismaClient) {
  /** The applied coupon's discount on the items that can be ordered, or why it doesn't apply. */
  async function evaluateCoupon(userId: string, code: string, subtotal: Prisma.Decimal) {
    try {
      const { coupon, discount } = await checkCoupon(prisma, { code, userId, subtotal });
      return { code: coupon.code, description: coupon.description, discount, message: null };
    } catch (error) {
      if (!(error instanceof AppError) || !COUPON_ERROR_CODES.includes(error.code)) throw error;
      return { code, description: null, discount: new Prisma.Decimal(0), message: error.message };
    }
  }

  async function getCart(userId: string) {
    const cart = await prisma.cart.findUnique({ where: { userId }, include: cartInclude });

    if (!cart || cart.items.length === 0) {
      return {
        id: cart?.id ?? null,
        items: [],
        itemCount: 0,
        subtotal: "0.00",
        coupon: null,
        bill: null,
        checkout: null,
        isValid: false,
      };
    }

    const sellable = await prisma.productVariant.findMany({
      where: { id: { in: cart.items.map((item) => item.variantId) }, ...customerVisibleVariant },
      select: { id: true, price: true, compareAtPrice: true, weightGrams: true, inventory: { select: { quantity: true } } },
    });
    const byVariantId = new Map(sellable.map((row) => [row.id, row]));

    let subtotal = new Prisma.Decimal(0);
    let weightGrams = 0;

    const items = cart.items.map((item) => {
      const { variant } = item;
      const listing = byVariantId.get(item.variantId);
      const available = listing?.inventory?.quantity ?? 0;
      const limit = maxOrderQuantity(variant);

      let issue: CartItemIssue | null = null;
      if (!listing) issue = "UNAVAILABLE";
      else if (available === 0) issue = "OUT_OF_STOCK";
      else if (item.quantity > available) issue = "INSUFFICIENT_STOCK";
      else if (item.quantity > limit) issue = "QUANTITY_LIMIT";

      const lineTotal = listing ? listing.price.mul(item.quantity) : null;
      if (lineTotal && !issue) {
        subtotal = subtotal.add(lineTotal);
        weightGrams += item.quantity * (listing?.weightGrams ?? 0);
      }

      return {
        id: item.id,
        productId: variant.product.id,
        variantId: variant.id,
        name: variant.product.name,
        variantLabel: variantLabel(variant),
        slug: variant.product.slug,
        imageUrl: imagesFor(variant.product.images, variant.id)[0]?.url ?? null,
        unit: variant.unit,
        packQuantity: variant.quantity?.toString() ?? null,
        weightGrams: listing?.weightGrams ?? null,
        quantity: item.quantity,
        maxQuantity: limit,
        unitPrice: listing?.price.toFixed(2) ?? null,
        compareAtPrice: listing?.compareAtPrice?.toFixed(2) ?? null,
        lineTotal: lineTotal?.toFixed(2) ?? null,
        issue,
        ...(issue === "INSUFFICIENT_STOCK" && { availableQuantity: available }),
      };
    });

    const [settings, block, coupon] = await Promise.all([
      getPlatformSettings(prisma),
      customerOrderBlock(prisma, userId),
      cart.couponCode ? evaluateCoupon(userId, cart.couponCode, subtotal) : null,
    ]);
    const charges = calculateCharges(subtotal, settings, { discount: coupon?.discount, weightGrams });

    return {
      id: cart.id,
      items,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      subtotal: subtotal.toFixed(2),
      /** The applied coupon; when it no longer applies, `message` says why and the bill has no discount. */
      coupon: coupon && { code: coupon.code, description: coupon.description, applied: coupon.message === null, message: coupon.message },
      // Preview of the checkout bill for the items that can be ordered; checkout recalculates it.
      bill: {
        subtotal: charges.subtotal.toFixed(2),
        shippingFee: charges.shippingFee.toFixed(2),
        codFee: charges.codFee.toFixed(2),
        discount: charges.discount.toFixed(2),
        total: charges.total.toFixed(2),
        totalWithCod: charges.totalWithCod.toFixed(2),
        minOrderValue: charges.minOrderValue.toFixed(2),
        meetsMinimum: charges.meetsMinimum,
        amountToFreeShipping: charges.amountToFreeShipping?.toFixed(2) ?? null,
      },
      checkout: await checkoutOptions(prisma, settings, charges.totalWithCod, block),
      isValid: items.every((item) => item.issue === null),
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

  async function addItem(userId: string, { variantId, quantity }: AddCartItemInput) {
    const cart = await ensureCart(userId);

    await prisma.$transaction(async (tx) => {
      await lockCart(tx, cart.id);

      const stock = await getSellableStock(tx, variantId);

      const existing = await tx.cartItem.findUnique({
        where: { cartId_variantId: { cartId: cart.id, variantId } },
        select: { quantity: true },
      });
      const newQuantity = (existing?.quantity ?? 0) + quantity;
      assertEnoughStock(newQuantity, stock);

      await tx.cartItem.upsert({
        where: { cartId_variantId: { cartId: cart.id, variantId } },
        update: { quantity: newQuantity },
        create: { cartId: cart.id, variantId, quantity: newQuantity },
      });
    });

    return getCart(userId);
  }

  async function findOwnItem(tx: Tx, userId: string, itemId: string) {
    const item = await tx.cartItem.findFirst({
      where: { id: itemId, cart: { userId } },
      select: { id: true, cartId: true, variantId: true },
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

      const stock = await getSellableStock(tx, item.variantId);
      assertEnoughStock(quantity, stock);

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
        await tx.cart.update({ where: { id: item.cartId }, data: { couponCode: null } });
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
      await tx.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
    });

    return getCart(userId);
  }

  /** Saves the code on the cart only if it applies to the cart now, so the customer sees why it doesn't. */
  async function applyCoupon(userId: string, code: string) {
    const cart = await getCart(userId);
    if (!cart.id || !cart.bill) {
      throw new AppError(409, "CART_EMPTY", "Add items to your cart before applying a coupon");
    }
    const { coupon } = await checkCoupon(prisma, { code, userId, subtotal: new Prisma.Decimal(cart.bill.subtotal) });
    await prisma.cart.update({ where: { id: cart.id }, data: { couponCode: coupon.code } });
    return getCart(userId);
  }

  async function removeCoupon(userId: string) {
    await prisma.cart.updateMany({ where: { userId }, data: { couponCode: null } });
    return getCart(userId);
  }

  return { getCart, addItem, updateItem, removeItem, clearCart, applyCoupon, removeCoupon };
}
