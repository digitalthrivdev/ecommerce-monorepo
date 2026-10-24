"use client";

import { Check, Minus, Plus, ShoppingBag, Zap } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";

import { addToCart } from "@/lib/actions";
import type { Address, CatalogProductDetail, CatalogVariant } from "@/lib/types";
import { cn, formatMoney } from "@/lib/utils";
import {
  choices,
  exactVariant,
  findVariantFromParams,
  pickVariant,
  sellableValues,
  variantToSearchParams,
} from "@/lib/variants";
import { SubmitButton } from "./action-form";
import { DirectCheckoutModal } from "./direct-checkout-modal";

type Props = {
  variants: CatalogVariant[];
  options?: CatalogProductDetail["options"];
  productName: string;
  productImage?: string | null;
  currency: string;
  customer?: { name?: string | null; phone?: string | null; email?: string | null } | null;
  savedAddresses?: Address[];
  initialVariantId?: string;
  productSlug?: string;
};

function discountPercent(price: string, compareAtPrice: string | null | undefined): number | null {
  if (!compareAtPrice) return null;
  const p = Number(price);
  const c = Number(compareAtPrice);
  if (!Number.isFinite(p) || !Number.isFinite(c) || c <= p) return null;
  return Math.round(((c - p) / c) * 100);
}

export function VariantPurchase({
  variants,
  options = [],
  productName,
  productImage,
  currency,
  customer,
  savedAddresses = [],
  initialVariantId,
  productSlug,
}: Props) {
  const fallbackVariant = variants.find((v) => v.inStock) ?? variants[0];
  const initialVariant = (initialVariantId && variants.find((v) => v.variantId === initialVariantId)) || fallbackVariant;
  const [variantId, setVariantId] = useState(initialVariant?.variantId ?? "");
  const [quantity, setQuantity] = useState(1);
  const [switchNotice, setSwitchNotice] = useState<string | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [state, action, pending] = useActionState(addToCart, { error: null });

  const selected = variants.find((item) => item.variantId === variantId) ?? initialVariant;

  // Synchronize browser address bar with canonical product slug and variant query params
  useEffect(() => {
    if (typeof window === "undefined" || !selected) return;

    const url = new URL(window.location.href);
    if (productSlug) {
      url.pathname = `/p/${encodeURIComponent(productSlug)}`;
    }

    const params = variantToSearchParams(options, selected);
    // Clear old variant and option keys
    if (options && options.length > 0) {
      options.forEach((opt) => {
        url.searchParams.delete(opt.name.toLowerCase());
        url.searchParams.delete(opt.name);
      });
    }
    url.searchParams.delete("variant");
    url.searchParams.delete("v");

    // Set new option/variant params
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    const newUrl = url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : "");
    const currentUrl = window.location.pathname + window.location.search;
    if (currentUrl !== newUrl) {
      window.history.replaceState(null, "", newUrl);
    }
  }, [selected, productSlug, options]);

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const search = new URLSearchParams(window.location.search);
      const paramsObj: Record<string, string> = {};
      search.forEach((val, key) => {
        paramsObj[key] = val;
      });
      const matched = findVariantFromParams(variants, options, paramsObj);
      if (matched) {
        setVariantId(matched.variantId);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [variants, options]);
  if (!selected) return <p className="text-muted-foreground">Currently unavailable</p>;

  const discount = discountPercent(selected.price, selected.compareAtPrice);
  const savings =
    selected.compareAtPrice && Number(selected.compareAtPrice) > Number(selected.price)
      ? (Number(selected.compareAtPrice) - Number(selected.price)).toFixed(2)
      : null;

  const checkoutItems = [
    {
      variantId: selected.variantId,
      name: productName,
      variantLabel: selected.label,
      imageUrl: selected.imageUrl || productImage,
      price: selected.price,
      quantity,
    },
  ];

  return (
    <>
      <form action={action} className="flex flex-col gap-4 rounded-3xl border border-gray-200 bg-card p-5 shadow-xs">
        <input type="hidden" name="variantId" value={selected.variantId} />
        <input type="hidden" name="quantity" value={quantity} />

        {/* 1. Dynamic Pricing & Savings Header */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-2.5">
            <span className="text-3xl font-black text-gray-900 sm:text-4xl">
              {formatMoney(selected.price, currency)}
            </span>
            {selected.compareAtPrice && (
              <span className="text-base text-gray-400 line-through sm:text-lg">
                {formatMoney(selected.compareAtPrice, currency)}
              </span>
            )}
            {discount && (
              <span className="rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-black text-emerald-800">
                {discount}% OFF
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {selected.inStock ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
                In Stock · Ready to dispatch
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">
                <span className="size-2 rounded-full bg-red-500" />
                Currently Out of Stock
              </span>
            )}

            {savings && selected.inStock && (
              <span className="text-xs font-semibold text-emerald-700">
                You save {formatMoney(savings, currency)}
              </span>
            )}
          </div>
        </div>

        {/* 2. Option Axes Selector (e.g. Size, Color, etc.) */}
        {options.length > 0 && (
          <div className="flex flex-col gap-4 border-t border-gray-100 pt-3">
            {options.map((option, optionIndex) => {
              const values = sellableValues(options, variants, optionIndex);
              if (values.length === 0) return null;
              const currentChoice = choices(options, selected)[optionIndex];
              const selectedValue = values.find((v) => v.id === currentChoice);

              return (
                <div key={option.id} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold uppercase tracking-wider text-gray-700">
                      {option.name}:{" "}
                      <span className="font-semibold text-primary">
                        {selectedValue?.value ?? "Select"}
                      </span>
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {values.map((val) => {
                      const isSelected = val.id === selectedValue?.id;
                      const exact = exactVariant(options, variants, selected, optionIndex, val.id);
                      const exists = Boolean(exact);
                      const isInStock = Boolean(exact?.inStock);

                      return (
                        <button
                          key={val.id}
                          type="button"
                          onClick={() => {
                            if (exact) {
                              setVariantId(exact.variantId);
                              setSwitchNotice(null);
                            } else {
                              const next = pickVariant(options, variants, selected, optionIndex, val.id);
                              if (next) {
                                setVariantId(next.variantId);
                                const nextChoices = choices(options, next);
                                const currentChoices = choices(options, selected);
                                const changed = options
                                  .map((opt, idx) => ({ opt, idx }))
                                  .filter(({ idx }) => idx !== optionIndex && nextChoices[idx] !== currentChoices[idx]);
                                if (changed.length > 0) {
                                  const details = changed
                                    .map(({ opt, idx }) => `${opt.name}: ${opt.values.find((v) => v.id === nextChoices[idx])?.value}`)
                                    .join(", ");
                                  setSwitchNotice(`Selected ${val.value} · Updated ${details}`);
                                } else {
                                  setSwitchNotice(null);
                                }
                              }
                            }
                          }}
                          title={
                            !exists
                              ? `${val.value} is not available in ${selectedValue?.value ?? "this combination"}`
                              : !isInStock
                                ? `${val.value} is currently out of stock`
                                : undefined
                          }
                          className={cn(
                            "relative flex min-h-10 min-w-14 cursor-pointer items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold transition-all",
                            isSelected
                              ? "border-2 border-primary bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/20"
                              : exists && isInStock
                                ? "border-gray-200 bg-white text-gray-800 hover:border-gray-400 hover:bg-gray-50"
                                : exists && !isInStock
                                  ? "border-dashed border-gray-300 bg-gray-50/70 text-gray-400 line-through hover:border-gray-400"
                                  : "border-dashed border-gray-200 bg-gray-100/60 text-gray-400 opacity-60 line-through",
                          )}
                        >
                          {val.value}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {switchNotice && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                <span className="size-1.5 shrink-0 rounded-full bg-amber-500" />
                <span>{switchNotice}</span>
              </div>
            )}
          </div>
        )}

        {/* 3. Pack / Unit Cards (when no option axes, but multiple variants) */}
        {options.length === 0 && variants.length > 1 && (
          <div className="flex flex-col gap-2.5 border-t border-gray-100 pt-3">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-700">
              Select Option / Pack
            </span>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {variants.map((v) => {
                const isSelected = v.variantId === selected.variantId;
                const vDiscount = discountPercent(v.price, v.compareAtPrice);

                return (
                  <button
                    key={v.variantId}
                    type="button"
                    onClick={() => setVariantId(v.variantId)}
                    className={cn(
                      "relative flex cursor-pointer flex-col items-start rounded-2xl border p-3 text-left transition-all",
                      isSelected
                        ? "border-2 border-primary bg-primary/5 shadow-xs ring-2 ring-primary/10"
                        : v.inStock
                          ? "border-gray-200 bg-white hover:border-gray-400 hover:shadow-xs"
                          : "border-dashed border-gray-200 bg-gray-50/60 opacity-60",
                    )}
                  >
                    {isSelected && (
                      <span className="absolute right-2 top-2 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                        <Check className="size-3 stroke-[3]" />
                      </span>
                    )}
                    <span className={cn("text-xs font-bold", isSelected ? "text-primary" : "text-gray-900")}>
                      {v.label || v.name || "Default"}
                    </span>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="text-sm font-extrabold text-gray-900">
                        {formatMoney(v.price, currency)}
                      </span>
                      {v.compareAtPrice && (
                        <span className="text-[11px] text-gray-400 line-through">
                          {formatMoney(v.compareAtPrice, currency)}
                        </span>
                      )}
                    </div>
                    {vDiscount && (
                      <span className="mt-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                        {vDiscount}% OFF
                      </span>
                    )}
                    {!v.inStock && (
                      <span className="mt-1 text-[10px] font-semibold text-red-600">
                        Out of stock
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 4. Quantity Stepper */}
        <div className="flex flex-col gap-1.5 border-t border-gray-100 pt-3">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-700">Quantity</span>
          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-xl border border-gray-300 bg-white shadow-2xs">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1 || !selected.inStock}
                className="flex size-10 cursor-pointer items-center justify-center rounded-l-xl text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Decrease quantity"
              >
                <Minus className="size-4" />
              </button>
              <span className="w-12 text-center text-sm font-bold text-gray-900 select-none">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(selected.maxOrderQuantity, q + 1))}
                disabled={quantity >= selected.maxOrderQuantity || !selected.inStock}
                className="flex size-10 cursor-pointer items-center justify-center rounded-r-xl text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Increase quantity"
              >
                <Plus className="size-4" />
              </button>
            </div>
            {selected.maxOrderQuantity < 10 && selected.inStock && (
              <span className="text-xs text-muted-foreground">
                (Max limit: {selected.maxOrderQuantity} per order)
              </span>
            )}
          </div>
        </div>

        {/* Feedback alerts */}
        {state.error && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">
            {state.error}
          </p>
        )}
        {state.success && (
          <div className="flex items-center justify-between rounded-xl bg-emerald-50 p-3 text-xs font-bold text-emerald-800">
            <span>✓ {state.success}</span>
            <Link href="/cart" className="underline hover:text-emerald-950">
              View cart →
            </Link>
          </div>
        )}

        {/* 5. Add to Cart & Buy Now Action Buttons */}
        <div className="grid grid-cols-1 gap-2.5 pt-2 sm:grid-cols-2">
          <SubmitButton
            className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full border-2 border-primary bg-white text-base font-bold text-primary transition-all hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={pending || !selected.inStock}
          >
            <ShoppingBag className="size-5" />
            {pending ? "Adding…" : selected.inStock ? "Add to cart" : "Out of stock"}
          </SubmitButton>

          <button
            type="button"
            onClick={() => setIsCheckoutOpen(true)}
            disabled={!selected.inStock}
            className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-primary text-base font-bold text-primary-foreground shadow-md transition-all hover:opacity-90 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Zap className="size-5 fill-current" />
            Buy Now
          </button>
        </div>
      </form>

      <DirectCheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        items={checkoutItems}
        currency={currency}
        defaultCustomer={customer}
        savedAddresses={savedAddresses}
      />
    </>
  );
}
