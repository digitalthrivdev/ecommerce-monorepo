"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";

import { deleteCustomer } from "@/app/(dashboard)/customers/actions";
import { deletePartner } from "@/app/(dashboard)/delivery-partners/actions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { toastResult } from "@/lib/action-toast";

const COPY = {
  customer:
    "Their name, email, phone number, saved addresses and cart are deleted, and they are signed out. Their orders stay, with the name and address on each order, for your tax records. They can sign up again with the same number as a new customer.",
  rider:
    "Their name, phone number and vehicle details are deleted, they are signed out and can't be assigned again. Their deliveries, cash deposits and payouts stay for your accounts. Pay out any unpaid earnings first.",
} as const;

/** Deletes a customer or rider account when they ask by email or phone. */
export function DeleteAccountButton({ kind, id, name }: { kind: keyof typeof COPY; id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      if (toastResult(await (kind === "customer" ? deleteCustomer(id) : deletePartner(id)))) {
        setOpen(false);
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline">
          <Trash2 />
          Delete account
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name}&apos;s account?</AlertDialogTitle>
          <AlertDialogDescription>
            Only when they asked for it. {COPY[kind]} This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep account</AlertDialogCancel>
          <Button variant="destructive" disabled={pending} onClick={submit}>
            {pending && <Loader2 className="animate-spin" />}
            Delete account
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
