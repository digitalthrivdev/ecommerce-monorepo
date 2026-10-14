"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";

import { deleteCustomer } from "@/app/(dashboard)/customers/actions";
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

/** Deletes a customer account when they ask by email or phone. */
export function DeleteAccountButton({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      if (toastResult(await deleteCustomer(id))) {
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
            Only when they asked for it. Their name, email, phone number, saved addresses and cart are deleted, and they are
            signed out. Their orders stay, with the name and address on each order, for your tax records. They can sign up again
            with the same number as a new customer. This cannot be undone.
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
