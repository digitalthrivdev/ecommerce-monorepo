"use client";

import { useState, useTransition } from "react";
import { Ban, Loader2 } from "lucide-react";

import { blockCustomer, unblockCustomer } from "@/app/(dashboard)/customers/actions";
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useFormAction } from "@/hooks/use-form-action";
import { toastResult } from "@/lib/action-toast";
import type { CustomerBlock } from "@/lib/types";

const OPTIONS: { value: CustomerBlock; title: string; description: string }[] = [
  { value: "COD", title: "Block cash on delivery", description: "They can still order and pay online." },
  {
    value: "ALL",
    title: "Block all orders",
    description: "They can still sign in, see past orders, report issues and delete their account. The app shows your support contact.",
  },
];

export function BlockCustomerDialog({ customerId, current }: { customerId: string; current: CustomerBlock | null }) {
  const [open, setOpen] = useState(false);
  const { pending, fieldErrors, onSubmit, reset } = useFormAction(blockCustomer, () => setOpen(false));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Ban />
          {current ? "Change block" : "Block"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <input type="hidden" name="customerId" value={customerId} />
          <DialogHeader>
            <DialogTitle>Block this customer</DialogTitle>
            <DialogDescription>Applies to new orders only. Orders already placed carry on as normal.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <FieldSet data-invalid={Boolean(fieldErrors.block)}>
              <FieldLegend variant="label">What to block</FieldLegend>
              <div className="flex flex-col gap-2">
                {OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className="flex cursor-pointer gap-3 rounded-lg border p-3 has-checked:border-primary has-checked:bg-primary/5"
                  >
                    <input type="radio" name="block" value={option.value} defaultChecked={option.value === (current ?? "COD")} className="mt-1 accent-primary" />
                    <span className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">{option.title}</span>
                      <span className="text-xs text-muted-foreground">{option.description}</span>
                    </span>
                  </label>
                ))}
              </div>
              <FieldError>{fieldErrors.block}</FieldError>
            </FieldSet>
            <Field data-invalid={Boolean(fieldErrors.reason)}>
              <FieldLabel htmlFor="block-reason">Reason</FieldLabel>
              <Textarea id="block-reason" name="reason" maxLength={300} rows={2} required placeholder="Refused two cash orders at the door" aria-invalid={Boolean(fieldErrors.reason)} />
              <FieldDescription>For other admins. The customer doesn&apos;t see it.</FieldDescription>
              <FieldError>{fieldErrors.reason}</FieldError>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Block
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function UnblockButton({ customerId }: { customerId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={() => startTransition(async () => void toastResult(await unblockCustomer(customerId)))}>
      {pending && <Loader2 className="animate-spin" />}
      Remove block
    </Button>
  );
}
