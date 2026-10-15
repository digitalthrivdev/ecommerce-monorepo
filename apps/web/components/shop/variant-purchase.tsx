"use client";

import { useActionState, useState } from "react";

import { addToCart } from "@/lib/actions";
import type { CatalogVariant } from "@/lib/types";
import { formatMoney } from "@/lib/utils";
import { SubmitButton } from "./action-form";

export function VariantPurchase({ variants, currency }: { variants: CatalogVariant[]; currency: string }) {
  const [variantId, setVariantId] = useState(variants[0]?.variantId ?? "");
  const [state, action, pending] = useActionState(addToCart, { error: null });
  const selected = variants.find((item) => item.variantId === variantId);
  if (!selected) return <p className="text-muted-foreground">Currently unavailable</p>;
  return (
    <form action={action} className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      {variants.length > 1 && <label className="grid gap-1 text-sm font-medium">Choose an option<select className="h-11 rounded-xl border bg-white px-3" value={variantId} onChange={(event) => setVariantId(event.target.value)}>{variants.map((item) => <option key={item.variantId} value={item.variantId}>{item.label || "Default"} · {formatMoney(item.price, currency)}{!item.inStock ? " · Out of stock" : ""}</option>)}</select></label>}
      <input type="hidden" name="variantId" value={variantId} />
      <p className="font-bold">{formatMoney(selected.price, currency)}{selected.compareAtPrice && <span className="ml-2 font-normal text-muted-foreground line-through">{formatMoney(selected.compareAtPrice, currency)}</span>}</p>
      <label className="grid gap-1 text-sm font-medium">Quantity<input name="quantity" type="number" min="1" max={selected.maxOrderQuantity} defaultValue="1" className="h-11 w-24 rounded-xl border px-3" /></label>
      {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      <SubmitButton className="w-full" disabled={pending || !selected.inStock}>{pending ? "Adding…" : selected.inStock ? "Add to cart" : "Out of stock"}</SubmitButton>
    </form>
  );
}
