"use client";

import { Loader2 } from "lucide-react";

import { saveStore } from "@/app/(dashboard)/stores/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useFormAction } from "@/hooks/use-form-action";
import type { StoreDetails } from "@/lib/types";

type TextFieldProps = {
  name: string;
  label: string;
  defaultValue?: string | null;
  error?: string;
  description?: string;
} & Omit<React.ComponentProps<typeof Input>, "name" | "defaultValue">;

function TextField({ name, label, defaultValue, error, description, ...props }: TextFieldProps) {
  const id = `store-${name}`;
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} name={name} defaultValue={defaultValue ?? ""} aria-invalid={Boolean(error)} {...props} />
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError>{error}</FieldError>
    </Field>
  );
}

export function StoreForm({ store }: { store?: StoreDetails }) {
  const { pending, fieldErrors, onSubmit } = useFormAction(saveStore);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      {store && <input type="hidden" name="id" value={store.id} />}
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField name="name" label="Name" defaultValue={store?.name} error={fieldErrors.name} maxLength={100} required />
          <TextField
            name="code"
            label="Code"
            defaultValue={store?.code}
            error={fieldErrors.code}
            maxLength={32}
            placeholder="e.g. BLR-KRM-01"
            className="uppercase"
            required
          />
        </div>
        <TextField
          name="phone"
          label="Phone"
          type="tel"
          defaultValue={store?.phone}
          error={fieldErrors.phone}
          placeholder="+919876543210"
          description="The store's contact number. Optional."
        />

        <FieldSet>
          <FieldLegend>Address</FieldLegend>
          <FieldGroup>
            <TextField name="addressLine1" label="Street address" defaultValue={store?.addressLine1} error={fieldErrors.addressLine1} maxLength={200} required />
            <TextField name="addressLine2" label="Area or landmark" defaultValue={store?.addressLine2} error={fieldErrors.addressLine2} maxLength={200} />
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField name="city" label="City" defaultValue={store?.city} error={fieldErrors.city} maxLength={100} required />
              <TextField name="state" label="State" defaultValue={store?.state} error={fieldErrors.state} maxLength={100} required />
              <TextField name="postalCode" label="Postal code" defaultValue={store?.postalCode} error={fieldErrors.postalCode} maxLength={12} required />
            </div>
          </FieldGroup>
        </FieldSet>

        <FieldSet>
          <FieldLegend>Delivery area</FieldLegend>
          <FieldDescription>
            Customers within the radius of this point can order from the store. Copy the coordinates from Google Maps by
            right-clicking the store&apos;s location.
          </FieldDescription>
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField name="latitude" label="Latitude" defaultValue={store?.latitude} error={fieldErrors.latitude} inputMode="decimal" placeholder="12.9352" required />
            <TextField name="longitude" label="Longitude" defaultValue={store?.longitude} error={fieldErrors.longitude} inputMode="decimal" placeholder="77.6245" required />
            <TextField
              name="serviceRadiusKm"
              label="Radius (km)"
              defaultValue={store ? Number(store.serviceRadiusKm).toString() : "3"}
              error={fieldErrors.serviceRadiusKm}
              inputMode="decimal"
              required
            />
          </div>
        </FieldSet>

        <Field orientation="horizontal">
          <Switch id="store-active" name="active" defaultChecked={(store?.status ?? "ACTIVE") === "ACTIVE"} />
          <FieldLabel htmlFor="store-active">Accepting orders</FieldLabel>
        </Field>
        <FieldDescription className="-mt-3">
          Inactive stores are hidden from customers and take no new orders. Orders already placed can still be completed.
        </FieldDescription>
      </FieldGroup>

      <div>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {store ? "Save changes" : "Create store"}
        </Button>
      </div>
    </form>
  );
}
