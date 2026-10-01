"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";

import { createPartner } from "@/app/(dashboard)/delivery-partners/actions";
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useFormAction } from "@/hooks/use-form-action";

export function AddPartnerDialog() {
  const [open, setOpen] = useState(false);
  const { pending, fieldErrors, onSubmit, reset } = useFormAction(createPartner);
  const invalid = (name: string) => Boolean(fieldErrors[name]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Add partner
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Add delivery partner</DialogTitle>
            <DialogDescription>They sign in to the delivery app with an OTP sent to this phone.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={invalid("phone")}>
              <FieldLabel htmlFor="partner-phone">Phone</FieldLabel>
              <Input id="partner-phone" name="phone" type="tel" placeholder="+919876543210" required aria-invalid={invalid("phone")} />
              <FieldError>{fieldErrors.phone}</FieldError>
            </Field>
            <Field data-invalid={invalid("name")}>
              <FieldLabel htmlFor="partner-name">Name</FieldLabel>
              <Input id="partner-name" name="name" maxLength={100} required aria-invalid={invalid("name")} />
              <FieldError>{fieldErrors.name}</FieldError>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={invalid("vehicleType")}>
                <FieldLabel htmlFor="partner-vehicle-type">Vehicle</FieldLabel>
                <Input id="partner-vehicle-type" name="vehicleType" maxLength={30} placeholder="e.g. Bike, Scooter" aria-invalid={invalid("vehicleType")} />
                <FieldError>{fieldErrors.vehicleType}</FieldError>
              </Field>
              <Field data-invalid={invalid("vehicleNumber")}>
                <FieldLabel htmlFor="partner-vehicle-number">Vehicle number</FieldLabel>
                <Input id="partner-vehicle-number" name="vehicleNumber" maxLength={20} placeholder="e.g. KA01AB1234" className="uppercase" aria-invalid={invalid("vehicleNumber")} />
                <FieldError>{fieldErrors.vehicleNumber}</FieldError>
              </Field>
            </div>
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Add partner
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
