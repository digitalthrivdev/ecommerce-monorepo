"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { updatePlatformSettings } from "@/app/(dashboard)/settings/actions";
import { Panel, Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useFormAction } from "@/hooks/use-form-action";
import { formatMoney } from "@/lib/format";
import type { PlatformSettings } from "@/lib/types";
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

const isAmount = (value: string) => /^\d+(\.\d{1,2})?$/.test(value.trim());

/** "Orders under ₹199 pay ₹25 delivery. …" from what is typed right now. */
function ChargesSummary({ values, currency }: { values: Record<"deliveryFee" | "freeDeliveryThreshold" | "minOrderValue", string>; currency: string }) {
  const money = (value: string) => formatMoney(value.trim(), currency);
  const parts: string[] = [];
  if (isAmount(values.minOrderValue) && Number(values.minOrderValue) > 0) {
    parts.push(`Customers must order at least ${money(values.minOrderValue)}.`);
  }
  if (isAmount(values.deliveryFee)) {
    if (Number(values.deliveryFee) === 0) parts.push("Delivery is always free.");
    else if (isAmount(values.freeDeliveryThreshold)) {
      parts.push(`Orders under ${money(values.freeDeliveryThreshold)} pay ${money(values.deliveryFee)} for delivery; bigger orders get free delivery.`);
    } else parts.push(`Every order pays ${money(values.deliveryFee)} for delivery.`);
  }
  if (parts.length === 0) return null;
  return <p className="rounded-lg bg-muted/60 px-4 py-3 text-sm">{parts.join(" ")}</p>;
}

export function SettingsForm({ settings, currency }: { settings: PlatformSettings; currency: string }) {
  const { pending, fieldErrors, onSubmit } = useFormAction(updatePlatformSettings);
  const symbol = currencySymbol(currency);
  const amount = { inputMode: "decimal", maxLength: 11, prefix: symbol } as const;
  const [charges, setCharges] = useState({
    deliveryFee: settings.deliveryFee,
    freeDeliveryThreshold: settings.freeDeliveryThreshold ?? "",
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
                name="deliveryFee"
                label="Delivery charge"
                defaultValue={settings.deliveryFee}
                error={fieldErrors.deliveryFee}
                description="Use 0 for always-free delivery."
                required
                {...amount}
                {...track("deliveryFee")}
              />
              <TextField
                name="freeDeliveryThreshold"
                label="Free delivery on orders above"
                defaultValue={settings.freeDeliveryThreshold}
                error={fieldErrors.freeDeliveryThreshold}
                description="Leave empty to always charge delivery."
                {...amount}
                {...track("freeDeliveryThreshold")}
              />
            </div>
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
            </div>
            <ChargesSummary values={charges} currency={currency} />
          </FieldGroup>
        </Panel>
      </Section>

      <Section title="Delivery time" hint="Shown at the top of the customer app's home page and at checkout while the store is open.">
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

      <Section title="What riders earn" hint="Paid for each delivered order. Past deliveries keep their old amount.">
        <Panel className="p-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              name="deliveryPartnerFee"
              label="Pay per delivery"
              defaultValue={settings.deliveryPartnerFee}
              error={fieldErrors.deliveryPartnerFee}
              required
              {...amount}
            />
            <TextField
              name="riderCashLimit"
              label="Cash a rider can hold"
              defaultValue={settings.riderCashLimit}
              error={fieldErrors.riderCashLimit}
              description="From cash-on-delivery orders. At this amount they get no new orders until they deposit. Leave empty for no limit."
              {...amount}
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
