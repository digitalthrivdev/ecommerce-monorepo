"use client";

import { useState } from "react";
import { Banknote, Loader2 } from "lucide-react";

import { recordDeposit } from "@/app/(dashboard)/rider-cash/actions";
import { MoneyInput } from "@/components/money-input";
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
import { formatMoney } from "@/lib/format";

export function RecordDepositDialog({ partnerId, riderName, inHand, currency, size = "sm" }: {
  partnerId: string;
  riderName: string;
  inHand: string;
  currency: string;
  size?: "sm" | "default";
}) {
  const [open, setOpen] = useState(false);
  const { pending, fieldErrors, onSubmit, reset } = useFormAction(recordDeposit, () => setOpen(false));
  const invalid = (name: string) => Boolean(fieldErrors[name]);
  const id = (name: string) => `deposit-${partnerId}-${name}`;
  const nothingToDeposit = Number(inHand) <= 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size={size} variant="outline" disabled={nothingToDeposit}>
          <Banknote />
          Record deposit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <input type="hidden" name="partnerId" value={partnerId} />
          <DialogHeader>
            <DialogTitle>Cash from {riderName}</DialogTitle>
            <DialogDescription>
              Count the cash first. They have {formatMoney(inHand, currency)} in hand; you can record part of it.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={invalid("amount")}>
              <FieldLabel htmlFor={id("amount")}>Amount received</FieldLabel>
              <MoneyInput id={id("amount")} name="amount" currency={currency} defaultValue={inHand} required aria-invalid={invalid("amount")} />
              <FieldError>{fieldErrors.amount}</FieldError>
            </Field>
            <Field data-invalid={invalid("note")}>
              <FieldLabel htmlFor={id("note")}>Note</FieldLabel>
              <Input id={id("note")} name="note" maxLength={200} placeholder="Optional" aria-invalid={invalid("note")} />
              <FieldDescription>For example, a receipt number.</FieldDescription>
              <FieldError>{fieldErrors.note}</FieldError>
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
              Record deposit
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
