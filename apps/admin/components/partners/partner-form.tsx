"use client";

import { Loader2 } from "lucide-react";

import { updatePartner } from "@/app/(dashboard)/delivery-partners/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useFormAction } from "@/hooks/use-form-action";
import type { DeliveryPartner } from "@/lib/types";

export function PartnerForm({ partner }: { partner: DeliveryPartner }) {
  const { pending, fieldErrors, onSubmit } = useFormAction(updatePartner);
  const invalid = (name: string) => Boolean(fieldErrors[name]);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <input type="hidden" name="id" value={partner.id} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="partner-phone">Phone</FieldLabel>
          <Input id="partner-phone" value={partner.phone} disabled readOnly />
          <FieldDescription>The phone number is their login and cannot be changed.</FieldDescription>
        </Field>
        <Field data-invalid={invalid("name")}>
          <FieldLabel htmlFor="partner-name">Name</FieldLabel>
          <Input id="partner-name" name="name" defaultValue={partner.name ?? ""} maxLength={100} required aria-invalid={invalid("name")} />
          <FieldError>{fieldErrors.name}</FieldError>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={invalid("vehicleType")}>
            <FieldLabel htmlFor="partner-vehicle-type">Vehicle</FieldLabel>
            <Input id="partner-vehicle-type" name="vehicleType" defaultValue={partner.vehicleType ?? ""} maxLength={30} aria-invalid={invalid("vehicleType")} />
            <FieldError>{fieldErrors.vehicleType}</FieldError>
          </Field>
          <Field data-invalid={invalid("vehicleNumber")}>
            <FieldLabel htmlFor="partner-vehicle-number">Vehicle number</FieldLabel>
            <Input id="partner-vehicle-number" name="vehicleNumber" defaultValue={partner.vehicleNumber ?? ""} maxLength={20} className="uppercase" aria-invalid={invalid("vehicleNumber")} />
            <FieldError>{fieldErrors.vehicleNumber}</FieldError>
          </Field>
        </div>
        <Field orientation="horizontal" data-invalid={invalid("isActive")}>
          <Switch id="partner-active" name="isActive" defaultChecked={partner.isActive} aria-invalid={invalid("isActive")} />
          <FieldLabel htmlFor="partner-active">Active</FieldLabel>
        </Field>
        {fieldErrors.isActive ? (
          <FieldError className="-mt-3">{fieldErrors.isActive}</FieldError>
        ) : (
          <FieldDescription className="-mt-3">
            Deactivated partners cannot use the delivery app or be assigned orders. Their history is kept.
          </FieldDescription>
        )}
      </FieldGroup>

      <div>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Save changes
        </Button>
      </div>
    </form>
  );
}
