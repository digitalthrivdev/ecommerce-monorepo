"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight, ImageIcon, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Block } from "@/components/section";
import { Pill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/format";
import { priceRange, totalStock, type PriceDraft } from "@/lib/product-editor";
import type { ProductImage } from "@/lib/types";
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

const FIELD_LABELS: Record<string, string> = {
  sku: "product code",
  quantity: "pack size",
  unit: "unit",
  barcode: "barcode",
  maxOrderQuantity: "max per order",
  optionValues: "options",
};

/** "Size 3, product code: " for "variants.2.sku". */
function errorLabel(path: string, draft: Draft) {
  const [list, index, field] = path.split(".");
  if (list === "variants" && index !== undefined) {
    const variant = draft.variants[Number(index)];
    const name = variant ? variantLabel(draft.options, variant) || "Size" : `Size ${Number(index) + 1}`;
    return `${name}${field ? `, ${FIELD_LABELS[field] ?? field}` : ""}: `;
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

type Summary = { price: string; stock: string; out: boolean };

function summarize(drafts: (PriceDraft | undefined)[], money: (value: string) => string): Summary {
  const ranges = drafts.map(priceRange).filter((range): range is { min: number; max: number } => range !== null);
  const stock = drafts.reduce((sum, draft) => sum + totalStock(draft), 0);
  const saved = drafts.some(Boolean);
  if (ranges.length === 0) return { price: saved ? "No price yet" : "Save to set price", stock: saved ? "—" : "", out: false };
  const min = Math.min(...ranges.map((range) => range.min));
  const max = Math.max(...ranges.map((range) => range.max));
  return {
    price: min === max ? money(String(min)) : `${money(String(min))} – ${money(String(max))}`,
    stock: stock === 0 ? "Out of stock" : `${stock} in stock`,
    out: stock === 0,
  };
}

type VariantsCardProps = {
  /** Absent while adding a product; sizes and options can be added once it is saved. */
  productId?: string;
  slug: string;
  images: ProductImage[];
  draft: Draft;
  onChange: (draft: Draft) => void;
  errors: Record<string, string>;
  /** Saved prices per size, for the summaries. */
  priceDrafts: Record<string, PriceDraft>;
  currency: string;
};

export function VariantsCard({ productId, slug, images, draft, onChange, errors, priceDrafts, currency }: VariantsCardProps) {
  const [adding, setAdding] = useState(false);
  const { options, variants } = draft;
  const money = (value: string) => formatMoney(value, currency);
  const missing = missingCombinations(draft).length;
  const hasOptions = options.length > 0;
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

  const single = variants[0]!;
  const singleField = (name: "quantity" | "unit" | "maxOrderQuantity") => ({
    value: single[name],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      onChange({ ...draft, variants: [{ ...single, [name]: event.target.value }] }),
    "aria-invalid": Boolean(errors[`variants.0.${name}`]),
  });

  const row = (variant: VariantDraft, nested: boolean) => {
    const summary = summarize([variant.id ? priceDrafts[variant.id] : undefined], money);
    const label = variantLabel(options, variant) || "Only size";
    const shownLabel = nested ? options.slice(1).map((option) => variant.values[option.key]).join(" · ") || label : label;
    const content = (
      <>
        <Thumb url={imageFor(variant)} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 font-medium">
            {shownLabel}
            {!variant.id && <Pill tone="blue">New</Pill>}
            {!variant.isActive && <Pill tone="gray">Off</Pill>}
          </span>
          <span className="text-xs text-muted-foreground">{variant.sku}</span>
        </span>
        <span className="text-right text-sm">
          <span className="block font-semibold tabular-nums">{summary.price}</span>
          <span className={cn("block text-xs", summary.out ? "font-semibold text-red-700 dark:text-red-400" : "text-muted-foreground")}>{summary.stock}</span>
        </span>
      </>
    );
    return (
      <li key={variant.key} className={cn("flex items-center gap-2", nested && "pl-6")}>
        {variant.id && productId ? (
          <Link
            href={`/products/${productId}/variants/${variant.id}`}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60"
          >
            {content}
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2">{content}</div>
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
      </li>
    );
  };

  const grouped = options.length >= 2;
  const groups = grouped
    ? options[0]!.values.map((value) => ({ value, variants: variants.filter((variant) => variant.values[options[0]!.key] === value) }))
    : [];
  const errorEntries = Object.entries(errors).filter(
    ([path]) =>
      (path.startsWith("variants.") || path.startsWith("options.")) &&
      (hasOptions || !/^variants\.0\.(quantity|unit|maxOrderQuantity|sku|barcode)$/.test(path)),
  );

  return (
    <Block
      title={hasOptions ? "Sizes and options" : "Size"}
      hint={hasOptions ? "Each size has its own price, stock and photo. Tap a size to change them." : undefined}
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
        <ul className="-mx-2 flex flex-col divide-y border-t">
          {grouped
            ? groups.map((group) => {
                const summary = summarize(group.variants.map((variant) => (variant.id ? priceDrafts[variant.id] : undefined)), money);
                return (
                  <li key={group.value}>
                    <details open className="group">
                      <summary className="flex cursor-pointer list-none items-center gap-3 px-2 py-2.5 hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
                        <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
                        <span className="flex-1 font-semibold">
                          {group.value}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {group.variants.length} {group.variants.length === 1 ? "size" : "sizes"}
                          </span>
                        </span>
                        <span className="pr-11 text-right text-sm">
                          <span className="block font-semibold tabular-nums">{summary.price}</span>
                          <span className="block text-xs text-muted-foreground">{summary.stock}</span>
                        </span>
                      </summary>
                      <ul className="flex flex-col pb-2">{group.variants.map((variant) => row(variant, true))}</ul>
                    </details>
                  </li>
                );
              })
            : variants.map((variant) => row(variant, false))}
        </ul>
      )}

      {errorEntries.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-destructive">
          {errorEntries.map(([path, message]) => (
            <li key={path}>
              {errorLabel(path, draft)}
              {message}
            </li>
          ))}
        </ul>
      )}
    </Block>
  );
}
