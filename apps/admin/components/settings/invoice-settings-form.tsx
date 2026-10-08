"use client";

import { Loader2 } from "lucide-react";

import { updateInvoiceSettings } from "@/app/(dashboard)/settings/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useFormAction } from "@/hooks/use-form-action";
import type { PlatformSettings } from "@/lib/types";

export function InvoiceSettingsForm({ settings }: { settings: PlatformSettings }) {
  const { pending, fieldErrors, onSubmit } = useFormAction(updateInvoiceSettings);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <FieldGroup>
        <Field data-invalid={Boolean(fieldErrors.businessName)}>
          <FieldLabel htmlFor="invoice-business-name">Legal name</FieldLabel>
          <Input
            id="invoice-business-name"
            name="businessName"
            defaultValue={settings.businessName ?? ""}
            maxLength={200}
            placeholder="Acme Retail Private Limited"
            aria-invalid={Boolean(fieldErrors.businessName)}
          />
          <FieldDescription>As on your GST registration. Also shown on your website. Leave empty to use the app name.</FieldDescription>
          <FieldError>{fieldErrors.businessName}</FieldError>
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={Boolean(fieldErrors.gstin)}>
            <FieldLabel htmlFor="invoice-gstin">GSTIN</FieldLabel>
            <Input
              id="invoice-gstin"
              name="gstin"
              defaultValue={settings.gstin ?? ""}
              maxLength={15}
              placeholder="29ABCDE1234F1ZW"
              className="uppercase"
              aria-invalid={Boolean(fieldErrors.gstin)}
            />
            <FieldDescription>A store registered in another state can have its own, on its store page.</FieldDescription>
            <FieldError>{fieldErrors.gstin}</FieldError>
          </Field>
          <Field data-invalid={Boolean(fieldErrors.deliveryFeeGstRate)}>
            <FieldLabel htmlFor="invoice-delivery-gst">GST in the delivery charge (%)</FieldLabel>
            <Input
              id="invoice-delivery-gst"
              name="deliveryFeeGstRate"
              defaultValue={Number(settings.deliveryFeeGstRate).toString()}
              inputMode="decimal"
              maxLength={5}
              required
              aria-invalid={Boolean(fieldErrors.deliveryFeeGstRate)}
            />
            <FieldDescription>Included in the charge, not added to it. Applies to new orders.</FieldDescription>
            <FieldError>{fieldErrors.deliveryFeeGstRate}</FieldError>
          </Field>
        </div>
      </FieldGroup>
      <div>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Save invoice details
        </Button>
      </div>
    </form>
  );
}
