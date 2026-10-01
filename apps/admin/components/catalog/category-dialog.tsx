"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";

import { saveCategory } from "@/app/(dashboard)/categories/actions";
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
import type { Category } from "@/lib/types";

export function CategoryDialog({ category }: { category?: Category }) {
  const [open, setOpen] = useState(false);
  const { pending, fieldErrors, onSubmit, reset } = useFormAction(saveCategory, () => setOpen(false));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        {category ? (
          <Button variant="outline" size="sm">
            Edit
          </Button>
        ) : (
          <Button>
            <Plus />
            New category
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{category ? `Edit ${category.name}` : "New category"}</DialogTitle>
            <DialogDescription>Categories group products in the customer app.</DialogDescription>
          </DialogHeader>
          {category && <input type="hidden" name="id" value={category.id} />}
          <FieldGroup>
            <Field data-invalid={Boolean(fieldErrors.name)}>
              <FieldLabel htmlFor="category-name">Name</FieldLabel>
              <Input id="category-name" name="name" defaultValue={category?.name} maxLength={100} required aria-invalid={Boolean(fieldErrors.name)} />
              <FieldError>{fieldErrors.name}</FieldError>
            </Field>
            <Field data-invalid={Boolean(fieldErrors.slug)}>
              <FieldLabel htmlFor="category-slug">Slug</FieldLabel>
              <Input id="category-slug" name="slug" defaultValue={category?.slug} maxLength={100} placeholder="Generated from the name" aria-invalid={Boolean(fieldErrors.slug)} />
              <FieldDescription>Used in links. Leave empty to generate it from the name.</FieldDescription>
              <FieldError>{fieldErrors.slug}</FieldError>
            </Field>
            <Field data-invalid={Boolean(fieldErrors.imageUrl)}>
              <FieldLabel htmlFor="category-image">Image URL</FieldLabel>
              <Input id="category-image" name="imageUrl" type="url" defaultValue={category?.imageUrl ?? ""} placeholder="https://" aria-invalid={Boolean(fieldErrors.imageUrl)} />
              <FieldError>{fieldErrors.imageUrl}</FieldError>
            </Field>
            <Field data-invalid={Boolean(fieldErrors.sortOrder)}>
              <FieldLabel htmlFor="category-sort">Sort order</FieldLabel>
              <Input id="category-sort" name="sortOrder" type="number" min={0} max={10000} step={1} defaultValue={category?.sortOrder ?? 0} aria-invalid={Boolean(fieldErrors.sortOrder)} />
              <FieldDescription>Lower numbers appear first.</FieldDescription>
              <FieldError>{fieldErrors.sortOrder}</FieldError>
            </Field>
            <Field orientation="horizontal">
              <Switch id="category-active" name="isActive" defaultChecked={category?.isActive ?? true} />
              <FieldLabel htmlFor="category-active">Visible to customers</FieldLabel>
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
              {category ? "Save" : "Create category"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
