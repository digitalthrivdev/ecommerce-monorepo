import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Minus, Package, Plus, ShoppingBag, Trash2 } from "lucide-react";

import { ActionForm, SubmitButton } from "@/components/shop/action-form";
import { applyCoupon, changeCartQuantity, removeCartItem, removeCoupon } from "@/lib/actions";
import { getCart } from "@/lib/catalog";
import { CART_ISSUE } from "@/lib/labels";
import { productPath } from "@/lib/paths";
import { cn, formatMoney } from "@/lib/utils";
import { getSettings } from "@/lib/website";

export const metadata: Metadata = { title: "Your cart", robots: { index: false, follow: false } };

export default async function CartPage() {
  const [cart, settings] = await Promise.all([getCart(), getSettings()]);

  if (cart.items.length === 0) {
    return (
      <section className="mx-auto flex w-full max-w-md flex-col items-center justify-center px-5 py-20 text-center">
        <div className="flex size-20 items-center justify-center rounded-full bg-gray-100 text-gray-400">
          <ShoppingBag className="size-10" />
        </div>
        <h1 className="mt-5 text-2xl font-black text-gray-900">Your cart is empty</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Looks like you haven&apos;t added anything to your cart yet.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-primary px-8 text-sm font-bold text-primary-foreground shadow-md transition hover:opacity-90"
        >
          Start Shopping
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex items-center justify-between border-b border-gray-100 pb-4">
        <h1 className="text-2xl font-black text-gray-900 sm:text-3xl">Shopping Cart</h1>
        <span className="text-sm font-semibold text-muted-foreground">
          {cart.itemCount} {cart.itemCount === 1 ? "item" : "items"}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
        {/* Cart items list */}
        <div className="flex flex-col gap-4">
          <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
            {cart.items.map((item) => (
              <li
                key={item.id || item.variantId}
                className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                {/* Product info */}
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div className="relative size-18 shrink-0 overflow-hidden rounded-xl border border-gray-100 bg-gray-50/50 p-1">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="size-full object-contain"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-gray-400">
                        <Package className="size-6" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <Link
                      href={productPath(item.slug || item.productId)}
                      className="truncate text-sm font-bold text-gray-900 hover:text-primary hover:underline sm:text-base block"
                    >
                      {item.name}
                    </Link>
                    {item.variantLabel && (
                      <p className="text-xs text-muted-foreground">{item.variantLabel}</p>
                    )}
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-sm font-black text-gray-900">
                        {item.unitPrice ? formatMoney(item.unitPrice, settings.currency) : "Unavailable"}
                      </span>
                      {item.compareAtPrice && (
                        <span className="text-xs text-gray-400 line-through">
                          {formatMoney(item.compareAtPrice, settings.currency)}
                        </span>
                      )}
                    </div>
                    {item.issue && (
                      <p className="mt-1 text-xs font-semibold text-red-600">
                        {CART_ISSUE[item.issue]}
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions: Stepper + Delete */}
                <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-50">
                  {/* Quantity Stepper forms */}
                  <div className="flex items-center rounded-xl border border-gray-200 bg-white">
                    {/* Decrease */}
                    {item.quantity <= 1 ? (
                      <form action={removeCartItem}>
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="variantId" value={item.variantId} />
                        <button
                          type="submit"
                          aria-label="Remove item"
                          className="flex size-9 cursor-pointer items-center justify-center text-red-500 hover:bg-red-50 rounded-l-xl transition"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </form>
                    ) : (
                      <form action={changeCartQuantity}>
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="variantId" value={item.variantId} />
                        <input type="hidden" name="quantity" value={item.quantity - 1} />
                        <button
                          type="submit"
                          aria-label="Decrease quantity"
                          className="flex size-9 cursor-pointer items-center justify-center text-gray-600 hover:bg-gray-100 rounded-l-xl transition"
                        >
                          <Minus className="size-4" />
                        </button>
                      </form>
                    )}

                    <span className="w-10 text-center text-sm font-bold select-none text-gray-900">
                      {item.quantity}
                    </span>

                    {/* Increase */}
                    <form action={changeCartQuantity}>
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="variantId" value={item.variantId} />
                      <input type="hidden" name="quantity" value={item.quantity + 1} />
                      <button
                        type="submit"
                        disabled={item.quantity >= item.maxQuantity}
                        aria-label="Increase quantity"
                        className="flex size-9 cursor-pointer items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-30 rounded-r-xl transition"
                      >
                        <Plus className="size-4" />
                      </button>
                    </form>
                  </div>

                  {/* Remove button */}
                  <form action={removeCartItem}>
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="variantId" value={item.variantId} />
                    <button
                      type="submit"
                      aria-label="Remove item"
                      className="flex size-9 items-center justify-center rounded-xl text-gray-400 hover:bg-red-50 hover:text-red-600 transition"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Sidebar: Coupon & Order Summary */}
        <div className="flex flex-col gap-4">
          {/* Coupon Box */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-2xs">
            <h2 className="text-sm font-bold text-gray-900">Discount Code</h2>
            {cart.coupon?.applied ? (
              <div className="mt-3 flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
                <span>✓ {cart.coupon.code} applied</span>
                <form action={removeCoupon}>
                  <button type="submit" className="text-xs text-red-600 underline hover:text-red-800">
                    Remove
                  </button>
                </form>
              </div>
            ) : (
              <ActionForm action={applyCoupon} className="mt-3 flex gap-2">
                <input
                  name="code"
                  placeholder="Enter coupon code"
                  className="h-10 min-w-0 flex-1 rounded-xl border border-gray-200 px-3 text-sm outline-hidden focus:border-primary"
                />
                <SubmitButton className="h-10 rounded-xl px-4 text-xs font-bold">Apply</SubmitButton>
              </ActionForm>
            )}
            {cart.coupon?.message && (
              <p className="mt-2 text-xs text-muted-foreground">{cart.coupon.message}</p>
            )}
          </div>

          {/* Order Summary */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs">
            <h2 className="text-base font-bold text-gray-900">Order Summary</h2>

            <div className="mt-4 flex flex-col gap-2.5 border-b border-gray-100 pb-4 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span className="font-semibold text-gray-900">
                  {formatMoney(cart.bill?.subtotal ?? cart.subtotal, settings.currency)}
                </span>
              </div>

              {cart.bill && (
                <>
                  <div className="flex justify-between text-gray-600">
                    <span>Shipping</span>
                    <span className="font-semibold text-gray-900">
                      {Number(cart.bill.shippingFee) === 0
                        ? "FREE"
                        : formatMoney(cart.bill.shippingFee, settings.currency)}
                    </span>
                  </div>

                  {Number(cart.bill.discount) > 0 && (
                    <div className="flex justify-between text-emerald-700 font-semibold">
                      <span>Discount</span>
                      <span>-{formatMoney(cart.bill.discount, settings.currency)}</span>
                    </div>
                  )}

                  {cart.bill.amountToFreeShipping && Number(cart.bill.amountToFreeShipping) > 0 && (
                    <p className="mt-1 text-xs text-blue-600 bg-blue-50 p-2 rounded-lg">
                      Add {formatMoney(cart.bill.amountToFreeShipping, settings.currency)} more for FREE shipping!
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="mt-4 flex items-baseline justify-between">
              <span className="text-base font-bold text-gray-900">Total</span>
              <span className="text-2xl font-black text-gray-900">
                {formatMoney(cart.bill?.total ?? cart.subtotal, settings.currency)}
              </span>
            </div>

            <Link
              href="/checkout"
              className={cn(
                "mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-base font-bold text-primary-foreground shadow-md transition hover:opacity-90",
                (!cart.isValid || (cart.bill && !cart.bill.meetsMinimum)) &&
                  "pointer-events-none opacity-50",
              )}
            >
              <span>Continue to Checkout</span>
              <ArrowRight className="size-4" />
            </Link>

            {cart.bill && !cart.bill.meetsMinimum && (
              <p className="mt-2 text-center text-xs font-semibold text-red-600">
                Minimum order is {formatMoney(cart.bill.minOrderValue, settings.currency)}.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
