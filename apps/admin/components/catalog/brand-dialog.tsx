"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";

import { saveBrand } from "@/app/(dashboard)/brands/actions";
import { Button } from "@/components/ui/button";
import { ImageField } from "@/components/image-field";
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
import type { Brand } from "@/lib/types";

export function BrandDialog({ brand }: { brand?: Brand }) {
  const [open, setOpen] = useState(false);
  const { pending, fieldErrors, onSubmit, reset } = useFormAction(saveBrand, () => setOpen(false));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        {brand ? (
          <Button variant="outline" size="sm">
            Edit
          </Button>
        ) : (
          <Button>
            <Plus />
            New brand
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{brand ? `Edit ${brand.name}` : "New brand"}</DialogTitle>
            <DialogDescription>Customers can search products by brand.</DialogDescription>
          </DialogHeader>
          {brand && <input type="hidden" name="id" value={brand.id} />}
          <FieldGroup>
            <Field data-invalid={Boolean(fieldErrors.name)}>
              <FieldLabel htmlFor="brand-name">Name</FieldLabel>
              <Input id="brand-name" name="name" defaultValue={brand?.name} maxLength={100} required aria-invalid={Boolean(fieldErrors.name)} />
              <FieldError>{fieldErrors.name}</FieldError>
            </Field>
            <Field data-invalid={Boolean(fieldErrors.slug)}>
              <FieldLabel htmlFor="brand-slug">Slug</FieldLabel>
              <Input id="brand-slug" name="slug" defaultValue={brand?.slug} maxLength={100} placeholder="Generated from the name" aria-invalid={Boolean(fieldErrors.slug)} />
              <FieldDescription>Used in links. Leave empty to generate it from the name.</FieldDescription>
              <FieldError>{fieldErrors.slug}</FieldError>
            </Field>
            <ImageField id="brand-logo" label="Logo" name="logoUrl" defaultValue={brand?.logoUrl ?? ""} error={fieldErrors.logoUrl} />
            <Field orientation="horizontal">
              <Switch id="brand-active" name="isActive" defaultChecked={brand?.isActive ?? true} />
              <FieldLabel htmlFor="brand-active">Active</FieldLabel>
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
              {brand ? "Save" : "Create brand"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
