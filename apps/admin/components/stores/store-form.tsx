"use client";

import { INDIAN_STATES } from "@shop/validation";
import { Loader2 } from "lucide-react";
import { useState } from "react";

import { saveStore } from "@/app/(dashboard)/stores/actions";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useFormAction } from "@/hooks/use-form-action";
import type { StoreDetails } from "@/lib/types";

import { StoreLocationPicker } from "./store-location-picker";

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
      <Input id={id} name={name} defaultValue={props.value === undefined ? (defaultValue ?? "") : undefined} aria-invalid={Boolean(error)} {...props} />
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError>{error}</FieldError>
    </Field>
  );
}

function parseCoordinate(value: string, limit: number) {
  const number = Number(value);
  return value.trim() !== "" && Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
}

export function StoreForm({ store }: { store?: StoreDetails }) {
  const { pending, fieldErrors, onSubmit } = useFormAction(saveStore);
  const [latitude, setLatitude] = useState(store?.latitude ?? "");
  const [longitude, setLongitude] = useState(store?.longitude ?? "");
  const [radius, setRadius] = useState(store ? Number(store.serviceRadiusKm).toString() : "3");

  const lat = parseCoordinate(latitude, 90);
  const lng = parseCoordinate(longitude, 180);
  const radiusKm = Number(radius) > 0 ? Number(radius) : null;

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
              <Field data-invalid={Boolean(fieldErrors.state)}>
                <FieldLabel htmlFor="store-state">State</FieldLabel>
                <Select name="state" defaultValue={INDIAN_STATES.find((state) => state.name === store?.state)?.name} required>
                  <SelectTrigger id="store-state" className="w-full" aria-invalid={Boolean(fieldErrors.state)}>
                    <SelectValue placeholder="Choose" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDIAN_STATES.map(({ name }) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError>{fieldErrors.state}</FieldError>
              </Field>
              <TextField name="postalCode" label="Postal code" defaultValue={store?.postalCode} error={fieldErrors.postalCode} maxLength={12} required />
            </div>
          </FieldGroup>
        </FieldSet>

        <TextField
          name="gstin"
          label="Store GSTIN"
          defaultValue={store?.gstin}
          error={fieldErrors.gstin}
          maxLength={20}
          placeholder="29ABCDE1234F1ZW"
          className="uppercase"
          description="Only if this store is registered in another state than the GSTIN in Settings. Its invoices then show this one."
        />
        {store && !store.invoiceGstin && (
          <Notice tone="warning" title="Invoices from this store have no GSTIN" className="-mt-3">
            The GSTIN in Settings → GST invoices is missing or registered in another state. Add it there, or this store&apos;s own GSTIN above.
          </Notice>
        )}

        <FieldSet>
          <FieldLegend>Delivery area</FieldLegend>
          <FieldDescription>Customers within the radius of the store&apos;s location can order from it.</FieldDescription>
          <StoreLocationPicker
            position={lat !== null && lng !== null ? { latitude: lat, longitude: lng } : null}
            radiusKm={radiusKm}
            onPick={(point) => {
              setLatitude(point.latitude.toFixed(6));
              setLongitude(point.longitude.toFixed(6));
            }}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              name="latitude"
              label="Latitude"
              value={latitude}
              onChange={(event) => setLatitude(event.target.value)}
              error={fieldErrors.latitude}
              inputMode="decimal"
              placeholder="12.9352"
              required
            />
            <TextField
              name="longitude"
              label="Longitude"
              value={longitude}
              onChange={(event) => setLongitude(event.target.value)}
              error={fieldErrors.longitude}
              inputMode="decimal"
              placeholder="77.6245"
              required
            />
            <TextField
              name="serviceRadiusKm"
              label="Delivers up to (km)"
              value={radius}
              onChange={(event) => setRadius(event.target.value)}
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
          Switched-off stores are hidden from customers and take no new orders. Orders already placed can still be finished.
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
