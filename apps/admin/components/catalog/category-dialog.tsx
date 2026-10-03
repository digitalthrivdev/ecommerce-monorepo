"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";

import { saveCategory } from "@/app/(dashboard)/categories/actions";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useFormAction } from "@/hooks/use-form-action";
import type { Category } from "@/lib/types";

const NONE = "none";

/** `parents` are the top-level categories a category can be placed under. */
export function CategoryDialog({ category, parents, defaultParentId }: {
  category?: Category;
  parents: Category[];
  /** Preselected parent for a new sub-category. */
  defaultParentId?: string;
}) {
  const [open, setOpen] = useState(false);
  const { pending, fieldErrors, onSubmit, reset } = useFormAction(saveCategory, () => setOpen(false));
  const parentChoices = parents.filter((parent) => parent.id !== category?.id);
  // Two levels only: a category with sub-categories stays top-level.
  const canHaveParent = !category || category.childCount === 0;

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
        ) : defaultParentId ? (
          <Button variant="ghost" size="sm">
            <Plus />
            Sub-category
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
            <DialogTitle>{category ? `Edit ${category.name}` : defaultParentId ? "New sub-category" : "New category"}</DialogTitle>
            <DialogDescription>Categories group products in the customer app.</DialogDescription>
          </DialogHeader>
          {category && <input type="hidden" name="id" value={category.id} />}
          <FieldGroup>
            <Field data-invalid={Boolean(fieldErrors.name)}>
              <FieldLabel htmlFor="category-name">Name</FieldLabel>
              <Input id="category-name" name="name" defaultValue={category?.name} maxLength={100} required aria-invalid={Boolean(fieldErrors.name)} />
              <FieldError>{fieldErrors.name}</FieldError>
            </Field>
            <Field data-invalid={Boolean(fieldErrors.parentId)}>
              <FieldLabel htmlFor="category-parent">Parent category</FieldLabel>
              <Select name="parentId" defaultValue={category?.parentId ?? defaultParentId ?? NONE} disabled={!canHaveParent}>
                <SelectTrigger id="category-parent" className="w-full" aria-invalid={Boolean(fieldErrors.parentId)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None (top-level)</SelectItem>
                  {parentChoices.map((parent) => (
                    <SelectItem key={parent.id} value={parent.id}>
                      {parent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                {canHaveParent
                  ? "Sub-categories appear inside their parent in the customer app."
                  : "This category has sub-categories, so it stays top-level."}
              </FieldDescription>
              <FieldError>{fieldErrors.parentId}</FieldError>
            </Field>
            <Field data-invalid={Boolean(fieldErrors.slug)}>
              <FieldLabel htmlFor="category-slug">Slug</FieldLabel>
              <Input id="category-slug" name="slug" defaultValue={category?.slug} maxLength={100} placeholder="Generated from the name" aria-invalid={Boolean(fieldErrors.slug)} />
              <FieldDescription>Used in links. Leave empty to generate it from the name.</FieldDescription>
              <FieldError>{fieldErrors.slug}</FieldError>
            </Field>
            <ImageField id="category-image" label="Image" name="imageUrl" defaultValue={category?.imageUrl ?? ""} error={fieldErrors.imageUrl} />
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
