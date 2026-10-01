"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { saveListing } from "@/app/(dashboard)/products/actions";
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
import { Switch } from "@/components/ui/switch";
import { useFormAction } from "@/hooks/use-form-action";
import type { ProductListing } from "@/lib/types";

export function ListingDialog({ productId, productName, store, listing }: ProductListing & {
  productId: string;
  productName: string;
}) {
  const [open, setOpen] = useState(false);
  const { pending, fieldErrors, onSubmit, reset } = useFormAction(saveListing, () => setOpen(false));
  const mode = listing ? "update" : "create";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant={listing ? "outline" : "default"} size="sm">
          {listing ? "Edit price" : "List at store"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{listing ? "Edit price" : "List at store"}</DialogTitle>
            <DialogDescription>
              {productName} at {store.name}
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="storeId" value={store.id} />
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="mode" value={mode} />
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(fieldErrors.sellingPrice)}>
                <FieldLabel htmlFor="listing-price">Selling price</FieldLabel>
                <Input id="listing-price" name="sellingPrice" inputMode="decimal" defaultValue={listing?.sellingPrice} placeholder="e.g. 68.00" required aria-invalid={Boolean(fieldErrors.sellingPrice)} />
                <FieldError>{fieldErrors.sellingPrice}</FieldError>
              </Field>
              <Field data-invalid={Boolean(fieldErrors.mrp)}>
                <FieldLabel htmlFor="listing-mrp">MRP</FieldLabel>
                <Input id="listing-mrp" name="mrp" inputMode="decimal" defaultValue={listing?.mrp ?? ""} placeholder="Optional" aria-invalid={Boolean(fieldErrors.mrp)} />
                <FieldError>{fieldErrors.mrp}</FieldError>
              </Field>
            </div>
            <FieldDescription>MRP is optional and cannot be lower than the selling price.</FieldDescription>
            {!listing && (
              <>
                <Field orientation="horizontal">
                  <Switch id="listing-available" name="isAvailable" defaultChecked />
                  <FieldLabel htmlFor="listing-available">Available to customers</FieldLabel>
                </Field>
                <FieldDescription>New listings start with zero stock. Add stock from the Inventory page.</FieldDescription>
              </>
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
              {listing ? "Save price" : "List product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
