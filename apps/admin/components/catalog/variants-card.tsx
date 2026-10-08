"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight, ImageIcon, Plus, Trash2, X } from "lucide-react";
import { DECIMAL_PATTERN } from "@grocery/validation";
import { toast } from "sonner";

import { MoneyInput } from "@/components/money-input";
import { Block } from "@/components/section";
import { Pill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney } from "@/lib/format";
import { draftPriceRange, type PriceDraft } from "@/lib/product-editor";
import type { ProductImage, Store } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  addMissingCombinations,
  addOption,
  addOptionValue,
  MAX_OPTION_VALUES,
  MAX_OPTIONS,
  missingCombinations,
  removeOption,
  removeOptionValue,
  removeVariant,
  variantLabel,
  type Draft,
  type OptionDraft,
  type VariantDraft,
} from "@/lib/variant-drafts";

const ALL = "all";
/** Tick box, size, then price, MRP, stock and actions as columns from sm up. */
const ROW_GRID = "grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 sm:grid-cols-[1.25rem_minmax(0,1fr)_6.5rem_6.5rem_4.5rem_4.5rem]";

const FIELD_LABELS: Record<string, string> = {
  sku: "product code",
  quantity: "pack size",
  unit: "unit",
  barcode: "barcode",
  maxOrderQuantity: "max per order",
  optionValues: "options",
  price: "price",
  mrp: "MRP",
  stock: "stock",
};

/** "1 kg, price: " for "variants.2.sku" or "price.<key>.all.price". */
function errorLabel(path: string, draft: Draft, stores: Store[]) {
  const parts = path.split(".");
  const name = (variant: VariantDraft | undefined, fallback: string) => (variant ? variantLabel(draft.options, variant) || "Size" : fallback);
  if (parts[0] === "price") {
    const [, key, scope, field] = parts;
    const variant = draft.variants.find((candidate) => candidate.key === key);
    const store = stores.find((candidate) => candidate.id === scope);
    return `${name(variant, "Size")}, ${FIELD_LABELS[field ?? ""] ?? field}${store && stores.length > 1 ? ` at ${store.name}` : ""}: `;
  }
  const [list, index, field] = parts;
  if (list === "variants" && index !== undefined) {
    return `${name(draft.variants[Number(index)], `Size ${Number(index) + 1}`)}${field ? `, ${FIELD_LABELS[field] ?? field}` : ""}: `;
  }
  if (list === "options" && index !== undefined) return `${draft.options[Number(index)]?.name || `Option ${Number(index) + 1}`}: `;
  return "";
}

function ValueInput({ disabled, onAdd }: { disabled: boolean; onAdd: (value: string) => boolean }) {
  const [value, setValue] = useState("");
  const add = () => {
    if (value.trim() && onAdd(value.trim())) setValue("");
  };
  return (
    <Input
      value={value}
      disabled={disabled}
      maxLength={50}
      placeholder={disabled ? "No more values allowed" : "Add a value, press Enter"}
      className="h-9 w-52"
      onChange={(event) => setValue(event.target.value.replace(",", ""))}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === ",") {
          event.preventDefault();
          add();
        }
      }}
      onBlur={add}
    />
  );
}

function AddOptionForm({ first, onAdd, onCancel }: { first: boolean; onAdd: (name: string, value: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(first ? "Size" : "");
  const [value, setValue] = useState("");
  const ready = Boolean(name.trim() && value.trim());
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="new-option-name">Choice name</FieldLabel>
          <Input id="new-option-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={50} placeholder="e.g. Size or Flavour" />
        </Field>
        <Field>
          <FieldLabel htmlFor="new-option-value">{first ? "Current size or flavour" : "First value"}</FieldLabel>
          <Input
            id="new-option-value"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            maxLength={50}
            placeholder="e.g. 500 g"
            autoFocus
          />
        </Field>
      </div>
      <p className="text-sm text-muted-foreground">
        {first ? "This is what you sell today. Add the other sizes after this." : "Sizes you already have get this value."}
      </p>
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={!ready} onClick={() => onAdd(name.trim(), value.trim())}>
          Add
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function OptionEditor({
  option,
  index,
  draft,
  slug,
  errors,
  apply,
  onRename,
}: {
  option: OptionDraft;
  index: number;
  draft: Draft;
  slug: string;
  errors: Record<string, string>;
  apply: (result: Draft | string) => boolean;
  onRename: (name: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5 py-4 first:pt-0">
      <div className="flex items-center gap-2">
        <Input
          value={option.name}
          onChange={(event) => onRename(event.target.value)}
          maxLength={50}
          aria-label="Choice name"
          aria-invalid={Boolean(errors[`options.${index}.name`])}
          className="h-9 w-44 font-semibold"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="ml-auto text-muted-foreground"
          aria-label={`Remove ${option.name}`}
          title={`Remove ${option.name}`}
          onClick={() => apply(removeOption(draft, option.key))}
        >
          <Trash2 />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {option.values.map((value) => (
          <span key={value} className="inline-flex h-8 items-center gap-1 rounded-md bg-muted pr-1 pl-2.5 text-sm font-medium">
            {value}
            {option.values.length > 1 && (
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                aria-label={`Remove ${value}`}
                onClick={() => apply(removeOptionValue(draft, option.key, value))}
              >
                <X className="size-3.5" />
              </button>
            )}
          </span>
        ))}
        <ValueInput disabled={option.values.length >= MAX_OPTION_VALUES} onAdd={(value) => apply(addOptionValue(draft, option.key, value, slug))} />
      </div>
    </div>
  );
}

function Thumb({ url }: { url: string | null }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-muted-foreground">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- uploaded or admin-entered URLs from any host
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <ImageIcon className="size-4" aria-hidden />
      )}
    </span>
  );
}

/** Tick boxes picked for bulk changes, and the bar that applies them. */
function BulkBar({
  count,
  currency,
  storeName,
  onPrice,
  onStock,
  onActive,
  onClear,
}: {
  count: number;
  currency: string;
  storeName: string | null;
  onPrice: (price: string, mrp: string) => void;
  onStock: (stock: string) => void;
  onActive: (active: boolean) => void;
  onClear: () => void;
}) {
  const [price, setPrice] = useState("");
  const [mrp, setMrp] = useState("");
  const [stock, setStock] = useState("");

  function applyPrice() {
    const p = price.trim();
    const m = mrp.trim();
    if (!DECIMAL_PATTERN.test(p) || Number(p) <= 0) return toast.error("Enter a price like 68 or 68.50");
    if (m && (!DECIMAL_PATTERN.test(m) || Number(m) < Number(p))) return toast.error("MRP must be a number no lower than the price");
    onPrice(p, m);
    setPrice("");
    setMrp("");
  }

  function applyStock() {
    if (!/^\d{1,7}$/.test(stock.trim())) return toast.error("Enter a whole number");
    onStock(stock.trim());
    setStock("");
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-primary-soft p-3">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-primary-ink">
          {count} {count === 1 ? "size" : "sizes"} ticked
        </span>
        <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={onClear}>
          Untick all
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <Field className="w-28">
            <FieldLabel htmlFor="bulk-price" className="text-xs">
              Price
            </FieldLabel>
            <MoneyInput id="bulk-price" currency={currency} value={price} onChange={(event) => setPrice(event.target.value)} className="h-9 bg-card" />
          </Field>
          <Field className="w-28">
            <FieldLabel htmlFor="bulk-mrp" className="text-xs">
              MRP
            </FieldLabel>
            <MoneyInput id="bulk-mrp" currency={currency} value={mrp} onChange={(event) => setMrp(event.target.value)} placeholder="Keep" className="h-9 bg-card" />
          </Field>
          <Button type="button" variant="outline" className="bg-card" onClick={applyPrice}>
            Set price
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Field className="w-24">
            <FieldLabel htmlFor="bulk-stock" className="text-xs">
              Stock{storeName ? ` at ${storeName}` : ""}
            </FieldLabel>
            <Input id="bulk-stock" inputMode="numeric" value={stock} onChange={(event) => setStock(event.target.value.replace(/\D/g, ""))} className="h-9 bg-card" />
          </Field>
          <Button type="button" variant="outline" className="bg-card" onClick={applyStock}>
            Set stock
          </Button>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="bg-card" onClick={() => onActive(true)}>
            Switch on
          </Button>
          <Button type="button" variant="outline" className="bg-card" onClick={() => onActive(false)}>
            Switch off
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">The price applies at every store. Nothing is saved until you press Save.</p>
    </div>
  );
}

type VariantsCardProps = {
  /** Absent while adding a product; sizes and options can be added once it is saved. */
  productId?: string;
  slug: string;
  images: ProductImage[];
  draft: Draft;
  onChange: (draft: Draft) => void;
  errors: Record<string, string>;
  stores: Store[];
  /** Price and stock of each size, keyed by variant key. */
  prices: Record<string, PriceDraft>;
  onPricesChange: (prices: Record<string, PriceDraft>) => void;
  currency: string;
};

export function VariantsCard({ productId, slug, images, draft, onChange, errors, stores, prices, onPricesChange, currency }: VariantsCardProps) {
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const { options, variants } = draft;
  const money = (value: number) => formatMoney(String(value), currency);
  const missing = missingCombinations(draft).length;
  const hasOptions = options.length > 0;
  const store = stores.find((candidate) => candidate.id === storeId) ?? null;
  const mainImage = images.find((image) => image.variantId === null)?.url ?? images[0]?.url ?? null;
  const imageFor = (variant: VariantDraft) => (variant.id && images.find((image) => image.variantId === variant.id)?.url) || mainImage;

  function apply(result: Draft | string) {
    if (typeof result === "string") {
      toast.error(result);
      return false;
    }
    onChange(result);
    return true;
  }

  const setPrice = (key: string, update: (draft: PriceDraft) => PriceDraft) => {
    const current = prices[key];
    if (current) onPricesChange({ ...prices, [key]: update(current) });
  };
  const setStoreRow = (pd: PriceDraft, changes: Partial<PriceDraft["stores"][string]>): PriceDraft =>
    store ? { ...pd, stores: { ...pd.stores, [store.id]: { ...pd.stores[store.id]!, ...changes } } } : pd;

  const single = variants[0]!;
  const singleField = (name: "quantity" | "unit" | "maxOrderQuantity") => ({
    value: single[name],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange({ ...draft, variants: [{ ...single, [name]: event.target.value }] }),
    "aria-invalid": Boolean(errors[`variants.0.${name}`]),
  });

  const visible = variants.filter((variant) => options.every((option) => !filters[option.key] || variant.values[option.key] === filters[option.key]));
  const liveSelected = new Set([...selected].filter((key) => variants.some((variant) => variant.key === key)));
  const toggle = (keys: string[], on: boolean) => {
    const next = new Set(liveSelected);
    for (const key of keys) {
      if (on) next.add(key);
      else next.delete(key);
    }
    setSelected(next);
  };
  const tickState = (keys: string[]) => {
    const ticked = keys.filter((key) => liveSelected.has(key)).length;
    return ticked === 0 ? false : ticked === keys.length ? true : ("indeterminate" as const);
  };

  function bulkPrice(price: string, mrp: string) {
    const next = { ...prices };
    for (const key of liveSelected) {
      const pd = next[key];
      if (pd) next[key] = { ...pd, same: true, price, mrp: mrp || pd.mrp };
    }
    onPricesChange(next);
  }
  function bulkStock(stock: string) {
    const next = { ...prices };
    for (const key of liveSelected) {
      const pd = next[key];
      if (pd) next[key] = setStoreRow(pd, { stock });
    }
    onPricesChange(next);
  }
  function bulkActive(isActive: boolean) {
    onChange({ ...draft, variants: variants.map((variant) => (liveSelected.has(variant.key) ? { ...variant, isActive } : variant)) });
  }

  const row = (variant: VariantDraft, nested: boolean) => {
    const pd = prices[variant.key];
    const label = variantLabel(options, variant) || "Only size";
    const shownLabel = nested ? options.slice(1).map((option) => variant.values[option.key]).join(" · ") || label : label;
    const priceScope = pd?.same ? "all" : storeId;
    const priceError = errors[`price.${variant.key}.${priceScope}.price`];
    const mrpError = errors[`price.${variant.key}.${priceScope}.mrp`];
    const stockError = errors[`price.${variant.key}.${storeId}.stock`];
    const storeRow = pd && store ? pd.stores[store.id] : undefined;
    const stockChanged = storeRow && /^\d+$/.test(storeRow.stock) && Number(storeRow.stock) !== storeRow.stockLoaded;
    const setPriceField = (field: "price" | "mrp", value: string) =>
      setPrice(variant.key, (current) => (current.same ? { ...current, [field]: value } : setStoreRow(current, { [field]: value })));
    return (
      <div key={variant.key} data-variant-row className={cn(ROW_GRID, "border-t py-2", nested && "sm:pl-8", !variant.isActive && "text-muted-foreground")}>
        <Checkbox checked={liveSelected.has(variant.key)} onCheckedChange={(on) => toggle([variant.key], on === true)} aria-label={`Tick ${label}`} />
        <div className="flex min-w-0 items-center gap-3">
          <Thumb url={imageFor(variant)} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 font-medium">
              {variant.id && productId ? (
                <Link href={`/products/${productId}/variants/${variant.id}`} className="underline-offset-4 hover:underline">
                  {shownLabel}
                </Link>
              ) : (
                shownLabel
              )}
              {!variant.id && <Pill tone="blue">New</Pill>}
              {!variant.isActive && <Pill tone="gray">Off</Pill>}
            </div>
            <div className="truncate text-xs text-muted-foreground">{variant.sku}</div>
          </div>
        </div>
        {/* On phones the boxes sit on a second line; from sm up they are columns of the row. */}
        <div className="col-span-3 grid grid-cols-3 gap-2 pl-8 sm:contents">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground sm:sr-only">Price</span>
            {pd && (
              <MoneyInput
                currency={currency}
                value={pd.same ? pd.price : (storeRow?.price ?? "")}
                onChange={(event) => setPriceField("price", event.target.value)}
                placeholder="No price"
                aria-label={`Price of ${label}`}
                aria-invalid={Boolean(priceError)}
                title={priceError}
                className="h-9"
              />
            )}
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground sm:sr-only">MRP</span>
            {pd && (
              <MoneyInput
                currency={currency}
                value={pd.same ? pd.mrp : (storeRow?.mrp ?? "")}
                onChange={(event) => setPriceField("mrp", event.target.value)}
                placeholder="—"
                aria-label={`MRP of ${label}`}
                aria-invalid={Boolean(mrpError)}
                title={mrpError}
                className="h-9"
              />
            )}
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground sm:sr-only">Stock</span>
            {storeRow && (
              <Input
                value={storeRow.stock}
                inputMode="numeric"
                onChange={(event) => setPrice(variant.key, (current) => setStoreRow(current, { stock: event.target.value.replace(/\D/g, "") }))}
                aria-label={`Stock of ${label}${store && stores.length > 1 ? ` at ${store.name}` : ""}`}
                aria-invalid={Boolean(stockError)}
                title={stockError ?? (stockChanged ? `Was ${storeRow.stockLoaded}` : undefined)}
                className={cn("h-9 text-right tabular-nums", stockChanged && "border-amber-500")}
              />
            )}
          </label>
        </div>
        <div className="col-start-3 row-start-1 flex items-center justify-end sm:col-start-auto sm:row-start-auto">
          {variant.id && productId && (
            <Button asChild variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={`Open ${label}`} title="Photo, barcode and price per store">
              <Link href={`/products/${productId}/variants/${variant.id}`}>
                <ChevronRight />
              </Link>
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            disabled={variants.length === 1}
            aria-label={`Remove ${label}`}
            title={`Remove ${label}`}
            onClick={() => apply(removeVariant(draft, variant.key))}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
    );
  };

  const grouped = options.length >= 2;
  const groups = grouped
    ? options[0]!.values
        .map((value) => ({ value, variants: visible.filter((variant) => variant.values[options[0]!.key] === value) }))
        .filter((group) => group.variants.length > 0)
    : [];
  const errorEntries = Object.entries(errors).filter(
    ([path]) =>
      (path.startsWith("variants.") || path.startsWith("options.") || (hasOptions && path.startsWith("price."))) &&
      (hasOptions || !/^variants\.0\.(quantity|unit|maxOrderQuantity|sku|barcode)$/.test(path)),
  );
  const hasNew = variants.some((variant) => !variant.id);

  return (
    <Block
      title={hasOptions ? "Sizes and options" : "Size"}
      hint={hasOptions ? "Type prices and stock here, or tick sizes to change many at once. Open a size for its photo, barcode and price per store." : undefined}
    >
      {!hasOptions && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field data-invalid={Boolean(errors["variants.0.quantity"])}>
            <FieldLabel htmlFor="single-quantity">Pack size</FieldLabel>
            <Input id="single-quantity" inputMode="decimal" placeholder="e.g. 500" {...singleField("quantity")} />
            <FieldError>{errors["variants.0.quantity"]}</FieldError>
          </Field>
          <Field data-invalid={Boolean(errors["variants.0.unit"])}>
            <FieldLabel htmlFor="single-unit">Unit</FieldLabel>
            <Input id="single-unit" maxLength={20} placeholder="g, kg, ml, L, pcs" {...singleField("unit")} />
            <FieldError>{errors["variants.0.unit"]}</FieldError>
          </Field>
          <Field data-invalid={Boolean(errors["variants.0.maxOrderQuantity"])}>
            <FieldLabel htmlFor="single-max">Max per order</FieldLabel>
            <Input id="single-max" inputMode="numeric" placeholder="No limit" {...singleField("maxOrderQuantity")} />
            <FieldError>{errors["variants.0.maxOrderQuantity"]}</FieldError>
          </Field>
        </div>
      )}

      {hasOptions && (
        <div className="flex flex-col divide-y rounded-lg border px-4 pt-4">
          {options.map((option, index) => (
            <OptionEditor
              key={option.key}
              option={option}
              index={index}
              draft={draft}
              slug={slug}
              errors={errors}
              apply={apply}
              onRename={(name) => onChange({ ...draft, options: options.map((candidate) => (candidate.key === option.key ? { ...candidate, name } : candidate)) })}
            />
          ))}
        </div>
      )}

      {!productId ? (
        <p className="text-sm text-muted-foreground">Sells in more sizes or flavours? Add them after you save.</p>
      ) : adding ? (
        <AddOptionForm
          first={!hasOptions}
          onAdd={(name, value) => {
            if (apply(addOption(draft, name, value))) setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.length < MAX_OPTIONS && (
            <Button type="button" variant="outline" onClick={() => setAdding(true)}>
              <Plus />
              {hasOptions ? "Add another choice, like flavour" : "This product comes in more sizes or flavours"}
            </Button>
          )}
          {missing > 0 && (
            <Button type="button" variant="ghost" onClick={() => apply(addMissingCombinations(draft, slug))}>
              Add {missing} missing {missing === 1 ? "size" : "sizes"}
            </Button>
          )}
        </div>
      )}

      {hasOptions && (
        <>
          {(variants.length > 3 || stores.length > 1) && (
            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              {variants.length > 3 &&
                options.map((option) => (
                  <Select
                    key={option.key}
                    value={filters[option.key] || ALL}
                    onValueChange={(value) => setFilters({ ...filters, [option.key]: value === ALL ? "" : value })}
                  >
                    <SelectTrigger
                      size="sm"
                      className={cn("w-40", filters[option.key] && "border-primary bg-primary-soft text-primary-ink")}
                      aria-label={`Show only one ${option.name}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Every {option.name.toLowerCase()}</SelectItem>
                      {option.values.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ))}
              {stores.length > 1 && (
                <div className="ml-auto flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Stock at</span>
                  <Select value={storeId} onValueChange={setStoreId}>
                    <SelectTrigger size="sm" className="w-44" aria-label="Store for the stock column">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {stores.map((candidate) => (
                        <SelectItem key={candidate.id} value={candidate.id}>
                          {candidate.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {liveSelected.size > 0 && (
            <BulkBar
              count={liveSelected.size}
              currency={currency}
              storeName={stores.length > 1 ? (store?.name ?? null) : null}
              onPrice={bulkPrice}
              onStock={bulkStock}
              onActive={bulkActive}
              onClear={() => setSelected(new Set())}
            />
          )}

          <div className="-mx-5 border-b px-5" role="group" aria-label="Sizes">
            <div className={cn(ROW_GRID, "border-t py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase")}>
              <Checkbox
                checked={tickState(visible.map((variant) => variant.key))}
                onCheckedChange={(on) => toggle(visible.map((variant) => variant.key), on === true)}
                aria-label="Tick every size shown"
              />
              <span>Size</span>
              <span className="hidden sm:block">Price</span>
              <span className="hidden sm:block">MRP</span>
              <span className="hidden sm:block">{stores.length > 1 ? "Stock here" : "Stock"}</span>
            </div>
            {grouped
              ? groups.flatMap((group) => {
                  const keys = group.variants.map((variant) => variant.key);
                  const ranges = group.variants.map((variant) => draftPriceRange(prices[variant.key])).filter((range) => range !== null);
                  const min = ranges.length ? Math.min(...ranges.map((range) => range.min)) : null;
                  const max = ranges.length ? Math.max(...ranges.map((range) => range.max)) : null;
                  return [
                    <div key={`group-${group.value}`} className="-mx-5 flex items-center gap-3 border-t bg-muted/40 px-5 py-2">
                      <Checkbox checked={tickState(keys)} onCheckedChange={(on) => toggle(keys, on === true)} aria-label={`Tick every ${group.value}`} />
                      <span className="font-semibold">{group.value}</span>
                      <span className="text-xs text-muted-foreground">
                        {group.variants.length} {group.variants.length === 1 ? "size" : "sizes"}
                        {min !== null && max !== null && ` · ${min === max ? money(min) : `${money(min)} – ${money(max)}`}`}
                      </span>
                    </div>,
                    ...group.variants.map((variant) => row(variant, true)),
                  ];
                })
              : visible.map((variant) => row(variant, false))}
            {visible.length === 0 && <p className="border-t py-6 text-center text-sm text-muted-foreground">No sizes match the filter.</p>}
          </div>

          {hasNew && (
            <p className="-mt-1 text-sm text-muted-foreground">
              New sizes start with the price of the closest size and no stock. Change them before saving if needed.
            </p>
          )}
        </>
      )}

      {errorEntries.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-destructive">
          {errorEntries.map(([path, message]) => (
            <li key={path}>
              {errorLabel(path, draft, stores)}
              {message}
            </li>
          ))}
        </ul>
      )}
    </Block>
  );
}
