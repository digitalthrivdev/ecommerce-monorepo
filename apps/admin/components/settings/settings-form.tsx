"use client";

import { useState } from "react";
import { DECIMAL_PATTERN } from "@shop/validation";
import { Loader2 } from "lucide-react";

import { updatePlatformSettings } from "@/app/(dashboard)/settings/actions";
import { Panel, Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useFormAction } from "@/hooks/use-form-action";
import { formatMoney } from "@/lib/format";
import type { PlatformSettings, WeightSlab } from "@/lib/types";
import { cn } from "@/lib/utils";

type TextFieldProps = {
  name: string;
  label: string;
  defaultValue?: string | null;
  error?: string;
  description?: string;
  /** Shown inside the box on the left, e.g. "₹". */
  prefix?: string;
} & Omit<React.ComponentProps<typeof Input>, "name" | "defaultValue" | "prefix">;

function TextField({ name, label, defaultValue, error, description, prefix, className, ...props }: TextFieldProps) {
  const id = `settings-${name}`;
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">{prefix}</span>
        )}
        <Input
          id={id}
          name={name}
          defaultValue={defaultValue ?? ""}
          aria-invalid={Boolean(error)}
          className={cn(prefix && "pl-8", className)}
          {...props}
        />
      </div>
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError>{error}</FieldError>
    </Field>
  );
}

function currencySymbol(currency: string) {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency }).formatToParts(0).find((part) => part.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
}

const isAmount = (value: string) => DECIMAL_PATTERN.test(value.trim());

/** "Orders under ₹199 pay ₹25 for shipping. …" from what is typed right now. */
function ChargesSummary({
  values,
  currency,
}: {
  values: Record<"shippingFee" | "freeShippingThreshold" | "codFee" | "minOrderValue", string>;
  currency: string;
}) {
  const money = (value: string) => formatMoney(value.trim(), currency);
  const parts: string[] = [];
  if (isAmount(values.minOrderValue) && Number(values.minOrderValue) > 0) {
    parts.push(`Customers must order at least ${money(values.minOrderValue)}.`);
  }
  if (isAmount(values.shippingFee)) {
    if (Number(values.shippingFee) === 0) parts.push("Shipping is always free.");
    else if (isAmount(values.freeShippingThreshold)) {
      parts.push(`Orders under ${money(values.freeShippingThreshold)} pay ${money(values.shippingFee)} for shipping; bigger orders get free shipping.`);
    } else parts.push(`Every order pays ${money(values.shippingFee)} for shipping.`);
  }
  if (isAmount(values.codFee) && Number(values.codFee) > 0) {
    parts.push(`Cash on delivery adds ${money(values.codFee)}.`);
  }
  if (parts.length === 0) return null;
  return <p className="rounded-lg bg-muted/60 px-4 py-3 text-sm">{parts.join(" ")}</p>;
}

function WeightSlabsField({ initial, error, prefix }: { initial: WeightSlab[]; error?: string; prefix: string }) {
  const [rows, setRows] = useState<WeightSlab[]>(initial);
  const update = (index: number, patch: Partial<WeightSlab>) =>
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel>Shipping by weight</FieldLabel>
      <input type="hidden" name="weightSlabs" value={JSON.stringify(rows)} />
      <div className="flex flex-col gap-3">
        {rows.map((row, index) => (
          <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-center gap-3">
            <Input
              inputMode="numeric"
              maxLength={7}
              aria-label={`Weight band ${index + 1}, up to grams`}
              value={row.maxWeightGrams || ""}
              onChange={(event) => update(index, { maxWeightGrams: Number(event.target.value.replace(/\D/g, "")) })}
              placeholder="500"
            />
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">{prefix}</span>
              <Input
                inputMode="decimal"
                maxLength={11}
                className="pl-8"
                aria-label={`Weight band ${index + 1} fee`}
                value={row.fee}
                onChange={(event) => update(index, { fee: event.target.value })}
                placeholder="40.00"
              />
            </div>
            <Button type="button" variant="outline" onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}>
              Remove
            </Button>
          </div>
        ))}
        {rows.length < 20 && (
          <Button type="button" variant="outline" className="w-fit" onClick={() => setRows((current) => [...current, { maxWeightGrams: 0, fee: "" }])}>
            Add a weight band
          </Button>
        )}
      </div>
      <FieldDescription>Optional. Each row is “up to this many grams, charge this”. The first band the parcel fits replaces the flat shipping charge. A heavier parcel pays the last band. Leave empty to always use the flat charge.</FieldDescription>
      <FieldError>{error}</FieldError>
    </Field>
  );
}

export function SettingsForm({ settings, currency }: { settings: PlatformSettings; currency: string }) {
  const { pending, fieldErrors, onSubmit } = useFormAction(updatePlatformSettings);
  const symbol = currencySymbol(currency);
  const amount = { inputMode: "decimal", maxLength: 11, prefix: symbol } as const;
  const [charges, setCharges] = useState({
    shippingFee: settings.shippingFee,
    freeShippingThreshold: settings.freeShippingThreshold ?? "",
    codFee: settings.codFee,
    minOrderValue: settings.minOrderValue,
  });
  const track = (name: keyof typeof charges) => ({
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => setCharges((current) => ({ ...current, [name]: event.target.value })),
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-8">
      <Section title="What customers pay" hint="New orders use these. Orders already placed keep their old charges.">
        <Panel className="p-5">
          <FieldGroup>
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                name="shippingFee"
                label="Shipping charge"
                defaultValue={settings.shippingFee}
                error={fieldErrors.shippingFee}
                description="Use 0 for always-free shipping. Weight bands below replace this."
                required
                {...amount}
                {...track("shippingFee")}
              />
              <TextField
                name="freeShippingThreshold"
                label="Free shipping on orders above"
                defaultValue={settings.freeShippingThreshold}
                error={fieldErrors.freeShippingThreshold}
                description="Leave empty to always charge shipping."
                {...amount}
                {...track("freeShippingThreshold")}
              />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                name="codFee"
                label="Cash on delivery charge"
                defaultValue={settings.codFee}
                error={fieldErrors.codFee}
                description="Added only when the customer pays cash on delivery. Use 0 for no charge."
                required
                {...amount}
                {...track("codFee")}
              />
            </div>
            <WeightSlabsField initial={settings.weightSlabs} error={fieldErrors.weightSlabs} prefix={symbol} />
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                name="minOrderValue"
                label="Smallest order allowed"
                defaultValue={settings.minOrderValue}
                error={fieldErrors.minOrderValue}
                description="Use 0 to allow any order size."
                required
                {...amount}
                {...track("minOrderValue")}
              />
              <TextField
                name="codMaxOrderValue"
                label="Largest cash-on-delivery order"
                defaultValue={settings.codMaxOrderValue}
                error={fieldErrors.codMaxOrderValue}
                description="Bigger orders must be paid online. Leave empty for no limit."
                {...amount}
              />
            </div>
            <ChargesSummary values={charges} currency={currency} />
          </FieldGroup>
        </Panel>
      </Section>

      <Section title="Delivery time" hint="Shown at the top of the customer app's home page and at checkout.">
        <Panel className="p-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              name="deliveryPromiseMinutes"
              label="Delivery in about"
              defaultValue={settings.deliveryPromiseMinutes?.toString()}
              error={fieldErrors.deliveryPromiseMinutes}
              description="Minutes, from 5 to 180. Leave empty to hide it."
              inputMode="numeric"
              maxLength={3}
              placeholder="15"
            />
          </div>
        </Panel>
      </Section>

      <Section title="Customer help line" hint="Shown in the customer app so people can reach you. Both are optional.">
        <Panel className="p-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              name="supportPhone"
              label="Phone number"
              type="tel"
              defaultValue={settings.supportPhone}
              error={fieldErrors.supportPhone}
              placeholder="+919876543210"
            />
            <TextField
              name="supportEmail"
              label="Email"
              type="email"
              defaultValue={settings.supportEmail}
              error={fieldErrors.supportEmail}
              maxLength={200}
              placeholder="help@yourshop.com"
            />
          </div>
        </Panel>
      </Section>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Save shop rules
        </Button>
      </div>
    </form>
  );
}
