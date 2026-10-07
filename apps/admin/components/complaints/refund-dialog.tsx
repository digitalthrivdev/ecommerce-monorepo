"use client";

import { useState } from "react";
import { Loader2, Undo2 } from "lucide-react";

import { refundComplaint, refundOrder } from "@/app/(dashboard)/complaints/actions";
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
import { Textarea } from "@/components/ui/textarea";
import { useFormAction } from "@/hooks/use-form-action";
import { formatMoney } from "@/lib/format";
import type { PaymentMethod } from "@/lib/types";

type RefundDialogProps = {
  /** A complaint is resolved by the refund; an order refund needs its own reason. */
  target: { complaintId: string } | { orderId: string };
  paymentMethod: PaymentMethod;
  defaultAmount: string;
  refundable: string;
  currency: string;
  label?: string;
  variant?: "default" | "outline";
};

export function RefundDialog({ target, paymentMethod, defaultAmount, refundable, currency, label = "Refund", variant = "default" }: RefundDialogProps) {
  const [open, setOpen] = useState(false);
  const forComplaint = "complaintId" in target;
  const { pending, fieldErrors, onSubmit, reset } = useFormAction(forComplaint ? refundComplaint : refundOrder, () => setOpen(false));
  const invalid = (name: string) => Boolean(fieldErrors[name]);
  const cash = paymentMethod === "COD";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant={variant} disabled={Number(refundable) <= 0}>
          <Undo2 />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {forComplaint ? (
            <input type="hidden" name="complaintId" value={target.complaintId} />
          ) : (
            <input type="hidden" name="orderId" value={target.orderId} />
          )}
          <DialogHeader>
            <DialogTitle>{forComplaint ? "Refund and resolve" : "Refund this order"}</DialogTitle>
            <DialogDescription>
              {cash
                ? "Cash orders are paid back by UPI or bank transfer. Send the money first, then record it here."
                : "The money goes back through the payment gateway to the customer's original payment method."}{" "}
              Up to {formatMoney(refundable, currency)} can be refunded.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={invalid("amount")}>
              <FieldLabel htmlFor="refund-amount">Amount</FieldLabel>
              <MoneyInput id="refund-amount" name="amount" currency={currency} defaultValue={defaultAmount} required aria-invalid={invalid("amount")} />
              <FieldError>{fieldErrors.amount}</FieldError>
            </Field>
            {cash ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={invalid("method")}>
                  <FieldLabel htmlFor="refund-method">Paid by</FieldLabel>
                  <Select name="method" defaultValue="UPI">
                    <SelectTrigger id="refund-method" className="w-full" aria-invalid={invalid("method")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UPI">UPI</SelectItem>
                      <SelectItem value="BANK_TRANSFER">Bank transfer</SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldError>{fieldErrors.method}</FieldError>
                </Field>
                <Field data-invalid={invalid("reference")}>
                  <FieldLabel htmlFor="refund-reference">Transaction reference</FieldLabel>
                  <Input id="refund-reference" name="reference" maxLength={100} required aria-invalid={invalid("reference")} />
                  <FieldError>{fieldErrors.reference}</FieldError>
                </Field>
              </div>
            ) : (
              <input type="hidden" name="method" value="" />
            )}
            {forComplaint ? (
              <Field data-invalid={invalid("note")}>
                <FieldLabel htmlFor="refund-note">Message to the customer</FieldLabel>
                <Textarea id="refund-note" name="note" maxLength={500} rows={3} required placeholder="Sorry about that. We've refunded the damaged items." aria-invalid={invalid("note")} />
                <FieldDescription>Shown in the app and sent as a notification.</FieldDescription>
                <FieldError>{fieldErrors.note}</FieldError>
              </Field>
            ) : (
              <Field data-invalid={invalid("reason")}>
                <FieldLabel htmlFor="refund-reason">Reason</FieldLabel>
                <Input id="refund-reason" name="reason" maxLength={500} required placeholder="Customer phoned: milk packet leaking" aria-invalid={invalid("reason")} />
                <FieldDescription>Shown to the customer with the refund.</FieldDescription>
                <FieldError>{fieldErrors.reason}</FieldError>
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
              {cash ? "Record refund" : "Refund now"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
