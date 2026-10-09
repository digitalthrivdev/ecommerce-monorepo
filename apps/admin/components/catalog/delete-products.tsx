"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";

import { deleteProducts, type DeleteProductsResult } from "@/app/(dashboard)/products/actions";
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

type DeleteProductsDialogProps = {
  ids: string[];
  /** e.g. "3 products" or "Amul Gold Milk". */
  label: string;
  size?: "default" | "sm";
  /** Opens another page after a delete; see deleteProducts. */
  leaving?: boolean;
  onDone?: (result: Extract<DeleteProductsResult, { ok: true }>) => void;
};

export function DeleteProductsDialog({ ids, label, size = "default", leaving, onDone }: DeleteProductsDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await deleteProducts(ids, { leaving });
      if (toastResult(result) && result.ok) {
        setOpen(false);
        onDone?.(result);
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size={size} disabled={ids.length === 0}>
          <Trash2 />
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {label}?</AlertDialogTitle>
          <AlertDialogDescription>
            Products that were never ordered are deleted with their sizes, photos, prices and stock, and taken out of carts. Products with
            past orders are hidden from the app instead, so old orders and invoices still show them. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep</AlertDialogCancel>
          <Button variant="destructive" disabled={pending} onClick={submit}>
            {pending && <Loader2 className="animate-spin" />}
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** On the product page: back to the list once deleted; stays when it was only hidden. */
export function DeleteProductButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  return <DeleteProductsDialog ids={[id]} label={name} leaving onDone={(result) => result.deleted > 0 && router.push("/products")} />;
}
