"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { MoneyInput } from "@/components/money-input";
import { Block } from "@/components/section";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { VariantDraft } from "@/lib/variant-drafts";

type CardProps = {
  variant: VariantDraft;
  onChange: (changes: Partial<VariantDraft>) => void;
  errors: Record<string, string>;
  /** Errors are keyed `<errorPrefix>.<field>`, e.g. `variants.0.price`. */
  errorPrefix: string;
};

function percentOff(price: string, compareAt: string) {
  const p = Number(price);
  const c = Number(compareAt);
  if (!(p > 0) || !(c > p)) return null;
  return Math.round((1 - p / c) * 100);
}

export function PriceCard({ variant, onChange, errors, errorPrefix, currency }: CardProps & { currency: string }) {
  const error = (field: string) => errors[`${errorPrefix}.${field}`];
  const off = percentOff(variant.price, variant.compareAtPrice);

  return (
    <Block title="Price" hint="Prices include GST.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={Boolean(error("price"))}>
          <FieldLabel htmlFor={`${variant.key}-price`}>Price customers pay</FieldLabel>
          <MoneyInput
            id={`${variant.key}-price`}
            currency={currency}
            value={variant.price}
            onChange={(event) => onChange({ price: event.target.value })}
            placeholder="0.00"
            aria-invalid={Boolean(error("price"))}
          />
          <FieldError>{error("price")}</FieldError>
        </Field>
        <Field data-invalid={Boolean(error("compareAtPrice"))}>
          <FieldLabel htmlFor={`${variant.key}-compare-at`}>
            Compare-at price <span className="font-normal text-muted-foreground">(e.g. MRP)</span>
          </FieldLabel>
          <MoneyInput
            id={`${variant.key}-compare-at`}
            currency={currency}
            value={variant.compareAtPrice}
            onChange={(event) => onChange({ compareAtPrice: event.target.value })}
            placeholder="Optional"
            aria-invalid={Boolean(error("compareAtPrice"))}
          />
          <FieldError>{error("compareAtPrice")}</FieldError>
        </Field>
        <FieldDescription className="sm:col-span-2">
          {off !== null
            ? `Customers see the compare-at price crossed out and “${off}% off”.`
            : "If you add a higher compare-at price, customers see it crossed out next to your price."}
        </FieldDescription>
      </div>
    </Block>
  );
}

/**
 * Stock of a saved size, read-only: it changes on the Stock page, where every change is logged.
 * `codes` are the product code and barcode boxes.
 */
export function StockCard({ stock, sku, codes, history }: { stock: number | null; sku: string; codes?: ReactNode; history?: ReactNode }) {
  return (
    <Block title="Stock">
      {codes}
      <div className={cn("flex flex-wrap items-center justify-between gap-3", codes && "border-t pt-4")}>
        {stock === null ? (
          <p className="text-sm text-muted-foreground">Starts at 0. Set the stock on the Stock page once this is saved.</p>
        ) : (
          <>
            <div className="flex items-center gap-1">
              <span className={cn("text-lg font-semibold tabular-nums", stock === 0 && "text-destructive")}>
                {stock === 0 ? "Out of stock" : `${stock} in stock`}
              </span>
              {history}
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href={`/inventory?q=${encodeURIComponent(sku)}`}>Change on the Stock page</Link>
            </Button>
          </>
        )}
      </div>
    </Block>
  );
}

const PARCEL_FIELDS = [
  { field: "weightGrams", label: "Weight (g)", inputMode: "numeric", placeholder: "e.g. 250" },
  { field: "lengthCm", label: "Length (cm)", inputMode: "decimal", placeholder: "e.g. 30" },
  { field: "breadthCm", label: "Breadth (cm)", inputMode: "decimal", placeholder: "e.g. 25" },
  { field: "heightCm", label: "Height (cm)", inputMode: "decimal", placeholder: "e.g. 3" },
] as const;

/** Packed weight and size, which couriers charge by. */
export function ParcelCard({ variant, onChange, errors, errorPrefix }: CardProps) {
  return (
    <Block title="Parcel" hint="Packed weight and size, for couriers. Optional.">
      <div className="grid gap-4 sm:grid-cols-4">
        {PARCEL_FIELDS.map(({ field, label, inputMode, placeholder }) => {
          const error = errors[`${errorPrefix}.${field}`];
          return (
            <Field key={field} data-invalid={Boolean(error)}>
              <FieldLabel htmlFor={`${variant.key}-${field}`}>{label}</FieldLabel>
              <Input
                id={`${variant.key}-${field}`}
                value={variant[field]}
                onChange={(event) => onChange({ [field]: event.target.value })}
                inputMode={inputMode}
                maxLength={11}
                placeholder={placeholder}
                aria-invalid={Boolean(error)}
              />
              <FieldError>{error}</FieldError>
            </Field>
          );
        })}
      </div>
    </Block>
  );
}
