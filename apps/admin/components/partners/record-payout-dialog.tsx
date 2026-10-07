"use client";

import { useState } from "react";
import { HandCoins, Loader2 } from "lucide-react";

import { recordPayout } from "@/app/(dashboard)/delivery-partners/payout-actions";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFormAction } from "@/hooks/use-form-action";
import { formatMoney, PAYOUT_METHOD_LABELS } from "@/lib/format";
import type { PayoutMethod } from "@/lib/types";

const METHODS = Object.entries(PAYOUT_METHOD_LABELS) as [PayoutMethod, string][];

export function RecordPayoutDialog({ partnerId, riderName, unpaid, currency, today }: {
  partnerId: string;
  riderName: string;
  unpaid: string;
  currency: string;
  /** In the business time zone. */
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const { pending, fieldErrors, onSubmit, reset } = useFormAction(recordPayout, () => setOpen(false));
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
        <Button size="sm" disabled={Number(unpaid) <= 0}>
          <HandCoins />
          Record payout
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <input type="hidden" name="partnerId" value={partnerId} />
          <DialogHeader>
            <DialogTitle>Pay {riderName}</DialogTitle>
            <DialogDescription>
              Record money you&apos;ve already paid. They&apos;re owed {formatMoney(unpaid, currency)}; you can pay part of it.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={invalid("amount")}>
                <FieldLabel htmlFor="payout-amount">Amount paid</FieldLabel>
                <MoneyInput id="payout-amount" name="amount" currency={currency} defaultValue={unpaid} required aria-invalid={invalid("amount")} />
                <FieldError>{fieldErrors.amount}</FieldError>
              </Field>
              <Field data-invalid={invalid("paidOn")}>
                <FieldLabel htmlFor="payout-date">Paid on</FieldLabel>
                <Input id="payout-date" name="paidOn" type="date" defaultValue={today} max={today} required aria-invalid={invalid("paidOn")} />
                <FieldError>{fieldErrors.paidOn}</FieldError>
              </Field>
            </div>
            <Field data-invalid={invalid("method")}>
              <FieldLabel htmlFor="payout-method">Paid by</FieldLabel>
              <Select name="method" defaultValue="UPI">
                <SelectTrigger id="payout-method" className="w-full" aria-invalid={invalid("method")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError>{fieldErrors.method}</FieldError>
            </Field>
            <Field data-invalid={invalid("note")}>
              <FieldLabel htmlFor="payout-note">Note</FieldLabel>
              <Input id="payout-note" name="note" maxLength={200} placeholder="Optional" aria-invalid={invalid("note")} />
              <FieldDescription>For example, the UPI or bank reference.</FieldDescription>
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
              Record payout
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
