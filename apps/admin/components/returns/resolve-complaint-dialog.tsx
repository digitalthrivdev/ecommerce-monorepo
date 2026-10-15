"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { resolveComplaint } from "@/app/(dashboard)/returns/actions";
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
import { Textarea } from "@/components/ui/textarea";
import { useFormAction } from "@/hooks/use-form-action";

const COPY = {
  APPROVED: {
    button: "Approve return",
    title: "Approve this return",
    description: "The customer can then arrange the reverse pickup and receive a refund when the item arrives.",
    placeholder: "Return approved. Please send the item back to us.",
  },
  REJECTED: {
    button: "Reject",
    title: "Reject this return",
    description: "Explain why, politely. The customer sees your message.",
    placeholder: "The photo shows the item as ordered, so we can't refund it.",
  },
} as const;

export function ResolveComplaintDialog({ complaintId, status }: { complaintId: string; status: keyof typeof COPY }) {
  const [open, setOpen] = useState(false);
  const { pending, fieldErrors, onSubmit, reset } = useFormAction(resolveComplaint, () => setOpen(false));
  const copy = COPY[status];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">{copy.button}</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <input type="hidden" name="complaintId" value={complaintId} />
          <input type="hidden" name="status" value={status} />
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>{copy.description}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={Boolean(fieldErrors.note)}>
              <FieldLabel htmlFor="resolve-note">Message to the customer</FieldLabel>
              <Textarea id="resolve-note" name="note" maxLength={500} rows={3} required placeholder={copy.placeholder} aria-invalid={Boolean(fieldErrors.note)} />
              <FieldDescription>Shown in the app and sent as a notification.</FieldDescription>
              <FieldError>{fieldErrors.note}</FieldError>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant={status === "REJECTED" ? "destructive" : "default"} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {copy.button}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
