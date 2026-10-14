"use client";

import { useState, useTransition } from "react";
import { INDIAN_STATES } from "@shop/validation";
import { Loader2, Plus } from "lucide-react";

import { deletePickupLocation, savePickupLocation, setDefaultPickupLocation } from "@/app/(dashboard)/pickup-locations/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useFormAction } from "@/hooks/use-form-action";
import { toastResult } from "@/lib/action-toast";
import type { PickupLocation } from "@/lib/types";

type TextFieldProps = {
  name: string;
  label: string;
  defaultValue?: string | null;
  error?: string;
  description?: string;
} & Omit<React.ComponentProps<typeof Input>, "name" | "defaultValue">;

function TextField({ name, label, defaultValue, error, description, ...props }: TextFieldProps) {
  const id = `pickup-${name}`;
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} name={name} defaultValue={defaultValue ?? ""} aria-invalid={Boolean(error)} {...props} />
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError>{error}</FieldError>
    </Field>
  );
}

export function PickupLocationDialog({ location, first = false }: { location?: PickupLocation; first?: boolean }) {
  const [open, setOpen] = useState(false);
  const { pending, fieldErrors, onSubmit, reset } = useFormAction(savePickupLocation, () => setOpen(false));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        {location ? (
          <Button variant="ghost" size="sm">
            Edit
          </Button>
        ) : (
          <Button>
            <Plus />
            Add pickup location
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{location ? `Edit ${location.name}` : "New pickup location"}</DialogTitle>
            <DialogDescription>Where couriers collect parcels. The default one is also the seller&apos;s address on invoices.</DialogDescription>
          </DialogHeader>
          {location && <input type="hidden" name="id" value={location.id} />}
          <FieldGroup>
            <TextField
              name="name"
              label="Name"
              defaultValue={location?.name}
              error={fieldErrors.name}
              maxLength={50}
              required
              placeholder="Main warehouse"
              description="For you and the courier; customers don't see it."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField name="contactName" label="Contact person" defaultValue={location?.contactName} error={fieldErrors.contactName} maxLength={100} required />
              <TextField
                name="phone"
                label="Phone"
                type="tel"
                defaultValue={location?.phone}
                error={fieldErrors.phone}
                placeholder="+919876543210"
                required
              />
            </div>
            <TextField name="email" label="Email (optional)" type="email" defaultValue={location?.email} error={fieldErrors.email} maxLength={200} />
            <TextField name="addressLine1" label="Address" defaultValue={location?.addressLine1} error={fieldErrors.addressLine1} maxLength={200} required />
            <TextField
              name="addressLine2"
              label="Address line 2 (optional)"
              defaultValue={location?.addressLine2}
              error={fieldErrors.addressLine2}
              maxLength={200}
            />
            <TextField name="landmark" label="Landmark (optional)" defaultValue={location?.landmark} error={fieldErrors.landmark} maxLength={200} />
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField name="city" label="City" defaultValue={location?.city} error={fieldErrors.city} maxLength={100} required />
              <Field data-invalid={Boolean(fieldErrors.state)}>
                <FieldLabel htmlFor="pickup-state">State</FieldLabel>
                <Select name="state" defaultValue={INDIAN_STATES.find((state) => state.name === location?.state)?.name} required>
                  <SelectTrigger id="pickup-state" className="w-full" aria-invalid={Boolean(fieldErrors.state)}>
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
              <TextField
                name="postalCode"
                label="PIN code"
                inputMode="numeric"
                defaultValue={location?.postalCode}
                error={fieldErrors.postalCode}
                maxLength={6}
                required
              />
            </div>
            {location?.isDefault ? (
              <FieldDescription>This is the default pickup location. Make another one the default to change it.</FieldDescription>
            ) : first ? (
              <FieldDescription>Your first pickup location becomes the default.</FieldDescription>
            ) : (
              <Field orientation="horizontal">
                <Switch id="pickup-default" name="isDefault" />
                <FieldLabel htmlFor="pickup-default">Make this the default</FieldLabel>
              </Field>
            )}
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {location ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MakeDefaultButton({ location }: { location: PickupLocation }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(async () => void toastResult(await setDefaultPickupLocation({ id: location.id })))}
    >
      {pending && <Loader2 className="animate-spin" />}
      Make default
    </Button>
  );
}

export function DeletePickupLocationButton({ location }: { location: PickupLocation }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await deletePickupLocation({ id: location.id });
      toastResult(result);
      if (result.ok) setOpen(false);
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {location.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {location.isDefault ? "It is your only pickup location, so invoices will have no seller address until you add one." : "This cannot be undone."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              confirm();
            }}
          >
            {pending && <Loader2 className="animate-spin" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
