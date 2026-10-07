"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { voidDeposit } from "@/app/(dashboard)/rider-cash/actions";
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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useFormAction } from "@/hooks/use-form-action";

export function VoidDepositDialog({ depositId, amount }: { depositId: string; amount: string }) {
  const [open, setOpen] = useState(false);
  const { pending, fieldErrors, onSubmit, reset } = useFormAction(voidDeposit, () => setOpen(false));
  const id = `void-${depositId}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          Void
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <input type="hidden" name="depositId" value={depositId} />
          <DialogHeader>
            <DialogTitle>Void this {amount} deposit?</DialogTitle>
            <DialogDescription>
              The amount goes back to the rider&apos;s cash in hand. The deposit stays in the list, marked as voided with your reason.
            </DialogDescription>
          </DialogHeader>
          <Field data-invalid={Boolean(fieldErrors.reason)}>
            <FieldLabel htmlFor={id}>Reason</FieldLabel>
            <Input id={id} name="reason" maxLength={300} required placeholder="e.g. Entered the wrong amount" aria-invalid={Boolean(fieldErrors.reason)} />
            <FieldError>{fieldErrors.reason}</FieldError>
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Void deposit
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
