"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { voidPayout } from "@/app/(dashboard)/delivery-partners/payout-actions";
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

export function VoidPayoutDialog({ payoutId, amount }: { payoutId: string; amount: string }) {
  const [open, setOpen] = useState(false);
  const { pending, fieldErrors, onSubmit, reset } = useFormAction(voidPayout, () => setOpen(false));
  const id = `void-payout-${payoutId}`;

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
          <input type="hidden" name="payoutId" value={payoutId} />
          <DialogHeader>
            <DialogTitle>Void this {amount} payout?</DialogTitle>
            <DialogDescription>
              The amount counts as unpaid again. The payout stays in the list, marked as voided with your reason.
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
              Void payout
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
