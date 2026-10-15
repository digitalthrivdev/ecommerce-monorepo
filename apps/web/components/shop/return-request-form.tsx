"use client";

import { useActionState, useMemo, useState } from "react";

import { requestReturn } from "@/lib/actions";
import type { OrderDetail } from "@/lib/types";
import { formatMoney } from "@/lib/utils";

type Item = OrderDetail["items"][number];

export function ReturnRequestForm({ orderId, items, currency }: { orderId: string; items: Item[]; currency: string }) {
  const [state, action, pending] = useActionState(requestReturn, { error: null });
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const selected = useMemo(() => Object.entries(quantities).filter(([, quantity]) => quantity > 0).map(([orderItemId, quantity]) => ({ orderItemId, quantity })), [quantities]);

  return (
    <form action={action} className="rounded-2xl border bg-card p-4">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="items" value={JSON.stringify(selected)} />
      <h2 className="text-lg font-bold">Request a return</h2>
      <p className="mt-1 text-sm text-muted-foreground">Choose the items and quantities you want to return. The shop will review your request.</p>
      <div className="mt-3 divide-y">
        {items.filter((item) => item.quantity > item.unavailableQuantity).map((item) => {
          const delivered = item.quantity - item.unavailableQuantity;
          return (
            <div key={item.id} className="flex items-center justify-between gap-3 py-3">
              <div><p className="font-medium">{item.productName}{item.variantName ? ` · ${item.variantName}` : ""}</p><p className="text-xs text-muted-foreground">{formatMoney(item.unitPrice, currency)} each · {delivered} delivered</p></div>
              <input aria-label={`Quantity to return for ${item.productName}`} type="number" min={0} max={delivered} value={quantities[item.id] ?? 0} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: Math.max(0, Math.min(delivered, Number(event.target.value) || 0)) }))} className="h-10 w-20 rounded-lg border bg-background px-2 text-center" />
            </div>
          );
        })}
      </div>
      <label className="mt-3 grid gap-1 text-sm">Reason
        <select name="reason" required defaultValue="DAMAGED" className="h-11 rounded-xl border bg-background px-3">
          <option value="DAMAGED">Damaged item</option><option value="WRONG_ITEM">Wrong item</option><option value="MISSING">Missing item</option><option value="EXPIRED">Expired or poor quality</option><option value="OTHER">Other</option>
        </select>
      </label>
      <label className="mt-3 grid gap-1 text-sm">Details (required for “Other”)
        <textarea name="note" maxLength={1000} rows={3} className="rounded-xl border bg-background p-3" />
      </label>
      <label className="mt-3 grid gap-1 text-sm">Photos (optional, up to 3)
        <input name="photos" type="file" accept="image/*" multiple className="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-muted file:px-3 file:py-2" />
      </label>
      {state.error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state.success && <p role="status" className="mt-3 rounded-xl bg-green-50 px-3 py-2 text-sm text-green-800">{state.success}</p>}
      <button type="submit" disabled={pending || selected.length === 0} className="mt-4 h-11 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
        {pending ? "Submitting…" : "Submit return request"}
      </button>
    </form>
  );
}
