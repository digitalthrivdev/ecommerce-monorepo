"use client";

import { Loader2 } from "lucide-react";

import { updatePlatformSettings } from "@/app/(dashboard)/settings/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useFormAction } from "@/hooks/use-form-action";
import type { PlatformSettings } from "@/lib/types";

type TextFieldProps = {
  name: string;
  label: string;
  defaultValue?: string | null;
  error?: string;
  description?: string;
} & Omit<React.ComponentProps<typeof Input>, "name" | "defaultValue">;

function TextField({ name, label, defaultValue, error, description, ...props }: TextFieldProps) {
  const id = `settings-${name}`;
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} name={name} defaultValue={defaultValue ?? ""} aria-invalid={Boolean(error)} {...props} />
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError>{error}</FieldError>
    </Field>
  );
}

export function SettingsForm({ settings, currency }: { settings: PlatformSettings; currency: string }) {
  const { pending, fieldErrors, onSubmit } = useFormAction(updatePlatformSettings);
  const amount = { inputMode: "decimal", maxLength: 11 } as const;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <FieldGroup>
        <FieldSet>
          <FieldLegend>Customer charges</FieldLegend>
          <FieldDescription>New carts and orders use these. Placed orders keep the charges they were placed with.</FieldDescription>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                name="deliveryFee"
                label={`Delivery fee (${currency})`}
                defaultValue={settings.deliveryFee}
                error={fieldErrors.deliveryFee}
                description="Charged on orders below the free delivery amount."
                required
                {...amount}
              />
              <TextField
                name="freeDeliveryThreshold"
                label={`Free delivery from (${currency})`}
                defaultValue={settings.freeDeliveryThreshold}
                error={fieldErrors.freeDeliveryThreshold}
                description="Subtotal at which delivery becomes free. Leave empty to always charge."
                {...amount}
              />
            </div>
            <TextField
              name="minOrderValue"
              label={`Minimum order value (${currency})`}
              defaultValue={settings.minOrderValue}
              error={fieldErrors.minOrderValue}
              description="Customers cannot check out below this subtotal. Use 0 for no minimum."
              required
              {...amount}
            />
          </FieldGroup>
        </FieldSet>

        <FieldSet>
          <FieldLegend>Delivery partners</FieldLegend>
          <TextField
            name="deliveryPartnerFee"
            label={`Payout per delivery (${currency})`}
            defaultValue={settings.deliveryPartnerFee}
            error={fieldErrors.deliveryPartnerFee}
            description="What a partner earns for each delivered order. Deliveries completed earlier keep their old amount."
            required
            {...amount}
          />
        </FieldSet>

        <FieldSet>
          <FieldLegend>Customer support</FieldLegend>
          <FieldDescription>Shown to customers in the app. Both are optional.</FieldDescription>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              name="supportPhone"
              label="Phone"
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
              placeholder="support@example.com"
            />
          </div>
        </FieldSet>
      </FieldGroup>

      <div>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Save settings
        </Button>
      </div>
    </form>
  );
}
