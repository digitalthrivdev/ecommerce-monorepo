"use client";

import { useState, useTransition } from "react";
import { Loader2, UserPlus } from "lucide-react";

import { addStaff, removeStaff } from "@/app/(dashboard)/stores/actions";
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
import { useFormAction } from "@/hooks/use-form-action";
import { toastResult } from "@/lib/action-toast";
import type { StaffMember } from "@/lib/types";

export function AddStaffDialog({ storeId, storeName }: { storeId: string; storeName: string }) {
  const [open, setOpen] = useState(false);
  const { pending, fieldErrors, onSubmit, reset } = useFormAction(addStaff, () => setOpen(false));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus />
          Add staff
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Add staff to {storeName}</DialogTitle>
            <DialogDescription>They sign in to this dashboard with an OTP sent to their phone.</DialogDescription>
          </DialogHeader>
          <input type="hidden" name="storeId" value={storeId} />
          <FieldGroup>
            <Field data-invalid={Boolean(fieldErrors.phone)}>
              <FieldLabel htmlFor="staff-phone">Phone</FieldLabel>
              <Input id="staff-phone" name="phone" type="tel" placeholder="+919876543210" required aria-invalid={Boolean(fieldErrors.phone)} />
              <FieldError>{fieldErrors.phone}</FieldError>
            </Field>
            <Field data-invalid={Boolean(fieldErrors.name)}>
              <FieldLabel htmlFor="staff-name">Name</FieldLabel>
              <Input id="staff-name" name="name" maxLength={100} aria-invalid={Boolean(fieldErrors.name)} />
              <FieldDescription>Optional. Shown in order history next to the actions they take.</FieldDescription>
              <FieldError>{fieldErrors.name}</FieldError>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Add staff
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveStaffButton({ storeId, member }: { storeId: string; member: StaffMember }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const label = member.name ?? member.phone;

  function confirm() {
    startTransition(async () => {
      const result = await removeStaff({ storeId, userId: member.id });
      toastResult(result);
      if (result.ok) setOpen(false);
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Remove
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {label}?</AlertDialogTitle>
          <AlertDialogDescription>
            They lose access to this store&apos;s orders and inventory immediately. You can add them back later.
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
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
