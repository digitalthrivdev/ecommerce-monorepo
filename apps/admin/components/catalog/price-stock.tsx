"use client";

import { Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";

import { MoneyInput } from "@/components/money-input";
import { Block } from "@/components/section";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { PriceDraft, StoreRowDraft } from "@/lib/product-editor";
import type { Store } from "@/lib/types";
import { cn } from "@/lib/utils";

type CardProps = {
  variantId: string;
  stores: Store[];
  draft: PriceDraft;
  onChange: (draft: PriceDraft) => void;
  errors: Record<string, string>;
  currency: string;
};

function percentOff(price: string, mrp: string) {
  const p = Number(price);
  const m = Number(mrp);
  if (!(p > 0) || !(m > p)) return null;
  return Math.round((1 - p / m) * 100);
}

function updateRow(draft: PriceDraft, storeId: string, changes: Partial<StoreRowDraft>): PriceDraft {
  return { ...draft, stores: { ...draft.stores, [storeId]: { ...draft.stores[storeId]!, ...changes } } };
}

export function PricingCard({ variantId, stores, draft, onChange, errors, currency }: CardProps) {
  const error = (scope: string, field: string) => errors[`price.${variantId}.${scope}.${field}`];
  const off = draft.same ? percentOff(draft.price, draft.mrp) : null;

  function setSame(same: boolean) {
    if (same) {
      onChange({ ...draft, same });
      return;
    }
    // Start each store from the shared price, so switching modes keeps what was typed.
    const storesWithPrice = Object.fromEntries(
      Object.entries(draft.stores).map(([storeId, row]) => [storeId, { ...row, price: row.price || draft.price, mrp: row.mrp || draft.mrp }]),
    );
    onChange({ ...draft, same, stores: storesWithPrice });
  }

  return (
    <Block title="Price" hint="Prices include GST.">
      {draft.same ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(error("all", "price"))}>
            <FieldLabel htmlFor={`${variantId}-price`}>Price customers pay</FieldLabel>
            <MoneyInput
              id={`${variantId}-price`}
              currency={currency}
              value={draft.price}
              onChange={(event) => onChange({ ...draft, price: event.target.value })}
              placeholder="0.00"
              aria-invalid={Boolean(error("all", "price"))}
            />
            <FieldError>{error("all", "price")}</FieldError>
          </Field>
          <Field data-invalid={Boolean(error("all", "mrp"))}>
            <FieldLabel htmlFor={`${variantId}-mrp`}>
              MRP <span className="font-normal text-muted-foreground">(printed on pack)</span>
            </FieldLabel>
            <MoneyInput
              id={`${variantId}-mrp`}
              currency={currency}
              value={draft.mrp}
              onChange={(event) => onChange({ ...draft, mrp: event.target.value })}
              placeholder="Optional"
              aria-invalid={Boolean(error("all", "mrp"))}
            />
            <FieldError>{error("all", "mrp")}</FieldError>
          </Field>
          <FieldDescription className="sm:col-span-2">
            {off !== null
              ? `Customers see the MRP crossed out and “${off}% off”.`
              : "If you add the MRP, customers see it crossed out next to your price."}
          </FieldDescription>
        </div>
      ) : (
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                <th className="px-5 py-2 font-semibold">Store</th>
                <th className="px-2 py-2 font-semibold">Price</th>
                <th className="py-2 pr-5 pl-2 font-semibold">MRP</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {stores.map((store) => {
                const row = draft.stores[store.id]!;
                return (
                  <tr key={store.id}>
                    <td className="px-5 py-2.5 font-medium">{store.name}</td>
                    <td className="px-2 py-2.5">
                      <MoneyInput
                        currency={currency}
                        value={row.price}
                        onChange={(event) => onChange(updateRow(draft, store.id, { price: event.target.value }))}
                        placeholder="Not selling"
                        aria-label={`Price at ${store.name}`}
                        aria-invalid={Boolean(error(store.id, "price"))}
                        title={error(store.id, "price")}
                        className="w-32"
                      />
                      {error(store.id, "price") && <p className="mt-1 text-xs text-destructive">{error(store.id, "price")}</p>}
                    </td>
                    <td className="py-2.5 pr-5 pl-2">
                      <MoneyInput
                        currency={currency}
                        value={row.mrp}
                        onChange={(event) => onChange(updateRow(draft, store.id, { mrp: event.target.value }))}
                        placeholder="Optional"
                        aria-label={`MRP at ${store.name}`}
                        aria-invalid={Boolean(error(store.id, "mrp"))}
                        className="w-32"
                      />
                      {error(store.id, "mrp") && <p className="mt-1 text-xs text-destructive">{error(store.id, "mrp")}</p>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {stores.length > 1 && (
        <label className="flex cursor-pointer items-center gap-3 border-t pt-4 text-sm">
          <Switch checked={draft.same} onCheckedChange={setSame} />
          <span>
            <span className="font-medium">Same price at every store</span>
            <span className="block text-muted-foreground">Turn off to set a different price at each store.</span>
          </span>
        </label>
      )}
    </Block>
  );
}

function StockStepper({ value, onChange, label, invalid }: { value: string; onChange: (value: string) => void; label: string; invalid: boolean }) {
  const number = Number(value);
  const valid = /^\d+$/.test(value);
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label={`One less, ${label}`}
        disabled={!valid || number <= 0}
        onClick={() => onChange(String(number - 1))}
      >
        <Minus />
      </Button>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/[^\d]/g, ""))}
        inputMode="numeric"
        aria-label={label}
        aria-invalid={invalid}
        className="h-9 w-14 px-1 text-center tabular-nums sm:w-20"
      />
      <Button type="button" variant="outline" size="icon-sm" aria-label={`One more, ${label}`} disabled={!valid} onClick={() => onChange(String(number + 1))}>
        <Plus />
      </Button>
    </div>
  );
}

/** Stock and whether each store sells this size; `codes` are the product code and barcode boxes. */
export function StockCard({ variantId, stores, draft, onChange, errors, codes, history }: Omit<CardProps, "currency"> & {
  codes?: ReactNode;
  /** A store's stock history button for this size; absent before the size is saved. */
  history?: (storeId: string) => ReactNode;
}) {
  const error = (storeId: string) => errors[`price.${variantId}.${storeId}.stock`];

  return (
    <Block title="Stock" hint="Type how many you have now. Changes are kept in the stock history.">
      {codes}
      <div className={cn("-mx-5 overflow-x-auto", codes && "border-t")}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <th className="px-5 py-2 font-semibold">Store</th>
              <th className="hidden px-2 py-2 font-semibold sm:table-cell">Selling</th>
              <th className="py-2 pr-5 pl-2 text-right font-semibold">In stock</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {stores.map((store) => {
              const row = draft.stores[store.id]!;
              const hasPrice = draft.same ? draft.price.trim() !== "" : row.price.trim() !== "";
              const changed = /^\d+$/.test(row.stock) && Number(row.stock) !== row.stockLoaded;
              const delta = Number(row.stock) - row.stockLoaded;
              const selling = hasPrice ? (
                <label className="flex w-fit items-center gap-2 text-xs text-muted-foreground">
                  <Switch
                    checked={row.selling}
                    onCheckedChange={(selling) => onChange(updateRow(draft, store.id, { selling }))}
                    aria-label={`Selling at ${store.name}`}
                  />
                  <span className="sm:hidden">{row.selling ? "Selling" : "Not selling"}</span>
                </label>
              ) : (
                <span className="text-xs text-muted-foreground">Set a price first</span>
              );
              return (
                <tr key={store.id}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1 font-medium">
                      {store.name}
                      {history && row.listed && history(store.id)}
                    </div>
                    {store.status === "INACTIVE" && <div className="text-xs text-muted-foreground">Store switched off</div>}
                    <div className="mt-1.5 sm:hidden">{selling}</div>
                  </td>
                  <td className="hidden px-2 py-3 sm:table-cell">{selling}</td>
                  <td className="py-3 pr-5 pl-2">
                    <div className="flex flex-col items-end gap-1">
                      <StockStepper
                        value={row.stock}
                        onChange={(stock) => onChange(updateRow(draft, store.id, { stock }))}
                        label={`In stock at ${store.name}`}
                        invalid={Boolean(error(store.id))}
                      />
                      {error(store.id) ? (
                        <p className="text-xs text-destructive">{error(store.id)}</p>
                      ) : (
                        changed && (
                          <p className={cn("text-xs font-medium", delta > 0 ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400")}>
                            {row.stockLoaded} → {row.stock} ({delta > 0 ? `+${delta}` : delta})
                          </p>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Block>
  );
}
