"use client";

import { Loader2 } from "lucide-react";

import { saveProduct } from "@/app/(dashboard)/products/actions";
import { Button } from "@/components/ui/button";
import { ImageField } from "@/components/image-field";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useFormAction } from "@/hooks/use-form-action";
import type { Category, Product } from "@/lib/types";

export function ProductForm({ product, categories }: { product?: Product; categories: Category[] }) {
  const { pending, fieldErrors, onSubmit } = useFormAction(saveProduct);
  const invalid = (name: string) => Boolean(fieldErrors[name]);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      {product && <input type="hidden" name="id" value={product.id} />}
      <FieldGroup>
        <Field data-invalid={invalid("name")}>
          <FieldLabel htmlFor="product-name">Name</FieldLabel>
          <Input id="product-name" name="name" defaultValue={product?.name} maxLength={200} required aria-invalid={invalid("name")} />
          <FieldError>{fieldErrors.name}</FieldError>
        </Field>

        <Field data-invalid={invalid("categoryId")}>
          <FieldLabel htmlFor="product-category">Category</FieldLabel>
          <Select name="categoryId" defaultValue={product?.categoryId}>
            <SelectTrigger id="product-category" className="w-full" aria-invalid={invalid("categoryId")}>
              <SelectValue placeholder="Choose a category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                  {!category.isActive && " (hidden)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError>{fieldErrors.categoryId}</FieldError>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={invalid("quantity")}>
            <FieldLabel htmlFor="product-quantity">Pack size</FieldLabel>
            <Input id="product-quantity" name="quantity" inputMode="decimal" defaultValue={product?.quantity ? Number(product.quantity).toString() : ""} placeholder="e.g. 500" aria-invalid={invalid("quantity")} />
            <FieldError>{fieldErrors.quantity}</FieldError>
          </Field>
          <Field data-invalid={invalid("unit")}>
            <FieldLabel htmlFor="product-unit">Unit</FieldLabel>
            <Input id="product-unit" name="unit" defaultValue={product?.unit ?? ""} maxLength={20} placeholder="e.g. g, kg, ml, L, pcs" aria-invalid={invalid("unit")} />
            <FieldError>{fieldErrors.unit}</FieldError>
          </Field>
        </div>

        <Field data-invalid={invalid("description")}>
          <FieldLabel htmlFor="product-description">Description</FieldLabel>
          <Textarea id="product-description" name="description" defaultValue={product?.description ?? ""} maxLength={2000} rows={4} aria-invalid={invalid("description")} />
          <FieldError>{fieldErrors.description}</FieldError>
        </Field>

        <ImageField
          id="product-image"
          label="Image"
          name="imageUrl"
          defaultValue={product?.imageUrl ?? ""}
          error={fieldErrors.imageUrl}
          description="Upload a photo or paste a link. A square photo on a plain background looks best."
        />

        <Field data-invalid={invalid("slug")}>
          <FieldLabel htmlFor="product-slug">Slug</FieldLabel>
          <Input id="product-slug" name="slug" defaultValue={product?.slug} maxLength={100} placeholder="Generated from the name" aria-invalid={invalid("slug")} />
          <FieldDescription>Used in links. Leave empty to generate it from the name.</FieldDescription>
          <FieldError>{fieldErrors.slug}</FieldError>
        </Field>

        <Field orientation="horizontal">
          <Switch id="product-active" name="isActive" defaultChecked={product?.isActive ?? true} />
          <FieldLabel htmlFor="product-active">Active in the catalog</FieldLabel>
        </Field>
        <FieldDescription className="-mt-3">Inactive products are hidden from customers in every store.</FieldDescription>
      </FieldGroup>

      <div>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {product ? "Save changes" : "Create product"}
        </Button>
      </div>
    </form>
  );
}
