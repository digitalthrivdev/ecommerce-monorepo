"use client";

import { Loader2 } from "lucide-react";

import { saveProduct } from "@/app/(dashboard)/products/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useFormAction } from "@/hooks/use-form-action";
import { categoryOptions } from "@/lib/categories";
import type { Brand, Category, ProductDetail } from "@/lib/types";

const NONE = "none";

type TextFieldProps = {
  name: string;
  label: string;
  defaultValue?: string | null;
  error?: string;
  description?: string;
} & Omit<React.ComponentProps<typeof Input>, "name" | "defaultValue">;

function TextField({ name, label, defaultValue, error, description, ...props }: TextFieldProps) {
  const id = `product-${name}`;
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} name={name} defaultValue={defaultValue ?? ""} aria-invalid={Boolean(error)} {...props} />
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError>{error}</FieldError>
    </Field>
  );
}

/**
 * Catalog details shared by every variant and store. Creating a product also creates its first
 * variant; sizes and flavours are added in the variants editor afterwards.
 */
export function ProductForm({ product, categories, brands }: { product?: ProductDetail; categories: Category[]; brands: Brand[] }) {
  const { pending, fieldErrors, onSubmit } = useFormAction(saveProduct);
  const invalid = (name: string) => Boolean(fieldErrors[name]);
  const vegValue = product?.isVeg === true ? "veg" : product?.isVeg === false ? "non-veg" : NONE;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      {product && <input type="hidden" name="id" value={product.id} />}
      <FieldGroup>
        <TextField name="name" label="Name" defaultValue={product?.name} error={fieldErrors.name} maxLength={200} required />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={invalid("categoryId")}>
            <FieldLabel htmlFor="product-category">Category</FieldLabel>
            <Select name="categoryId" defaultValue={product?.categoryId}>
              <SelectTrigger id="product-category" className="w-full" aria-invalid={invalid("categoryId")}>
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                {categoryOptions(categories).map(({ category, depth }) => (
                  <SelectItem key={category.id} value={category.id} className={depth ? "pl-6" : undefined}>
                    {category.name}
                    {!category.isActive && " (hidden)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError>{fieldErrors.categoryId}</FieldError>
          </Field>

          <Field data-invalid={invalid("brandId")}>
            <FieldLabel htmlFor="product-brand">Brand</FieldLabel>
            <Select name="brandId" defaultValue={product?.brandId ?? NONE}>
              <SelectTrigger id="product-brand" className="w-full" aria-invalid={invalid("brandId")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No brand</SelectItem>
                {brands.map((brand) => (
                  <SelectItem key={brand.id} value={brand.id}>
                    {brand.name}
                    {!brand.isActive && " (hidden)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError>{fieldErrors.brandId}</FieldError>
          </Field>
        </div>

        <Field data-invalid={invalid("description")}>
          <FieldLabel htmlFor="product-description">Description</FieldLabel>
          <Textarea id="product-description" name="description" defaultValue={product?.description ?? ""} maxLength={2000} rows={4} aria-invalid={invalid("description")} />
          <FieldError>{fieldErrors.description}</FieldError>
        </Field>

        <TextField
          name="tags"
          label="Search keywords"
          defaultValue={product?.tags.join(", ")}
          error={fieldErrors.tags}
          placeholder="e.g. doodh, toned milk"
          description="Comma-separated. Customers searching for any of these words find the product."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="product-veg">Food type</FieldLabel>
            <Select name="isVeg" defaultValue={vegValue}>
              <SelectTrigger id="product-veg" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not food / not specified</SelectItem>
                <SelectItem value="veg">Vegetarian</SelectItem>
                <SelectItem value="non-veg">Non-vegetarian</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <TextField
            name="slug"
            label="Slug"
            defaultValue={product?.slug}
            error={fieldErrors.slug}
            maxLength={100}
            placeholder="Generated from the name"
            description="Used in links. Leave empty to generate it."
          />
        </div>

        {!product && (
          <FieldSet>
            <FieldLegend>First variant</FieldLegend>
            <FieldDescription>Add more sizes or flavours after creating the product.</FieldDescription>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField name="sku" label="SKU" error={fieldErrors.sku} maxLength={64} placeholder="e.g. AMUL-TAAZA-1L" className="uppercase" required />
              <TextField
                name="maxOrderQuantity"
                label="Max per order"
                error={fieldErrors.maxOrderQuantity}
                inputMode="numeric"
                placeholder="No extra limit"
              />
              <TextField name="quantity" label="Pack size" error={fieldErrors.quantity} inputMode="decimal" placeholder="e.g. 500" />
              <TextField name="unit" label="Unit" error={fieldErrors.unit} maxLength={20} placeholder="e.g. g, kg, ml, L, pcs" />
            </div>
          </FieldSet>
        )}

        <FieldSet>
          <FieldLegend>Tax</FieldLegend>
          <FieldDescription>Prices include GST. Each order line records the tax it includes.</FieldDescription>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField name="hsnCode" label="HSN code" defaultValue={product?.hsnCode} error={fieldErrors.hsnCode} inputMode="numeric" maxLength={8} placeholder="e.g. 0401" />
            <TextField
              name="gstRate"
              label="GST rate (%)"
              defaultValue={product?.gstRate ? Number(product.gstRate).toString() : ""}
              error={fieldErrors.gstRate}
              inputMode="decimal"
              placeholder="e.g. 5"
            />
          </div>
        </FieldSet>

        <FieldSet>
          <FieldLegend>Label details</FieldLegend>
          <FieldDescription>Shown on the product page, as printed on the pack. All optional.</FieldDescription>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField name="manufacturerName" label="Manufacturer" defaultValue={product?.manufacturerName} error={fieldErrors.manufacturerName} maxLength={200} />
              <TextField name="countryOfOrigin" label="Country of origin" defaultValue={product?.countryOfOrigin} error={fieldErrors.countryOfOrigin} maxLength={100} placeholder="e.g. India" />
            </div>
            <TextField name="manufacturerAddress" label="Manufacturer address" defaultValue={product?.manufacturerAddress} error={fieldErrors.manufacturerAddress} maxLength={500} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField name="fssaiLicense" label="FSSAI licence" defaultValue={product?.fssaiLicense} error={fieldErrors.fssaiLicense} inputMode="numeric" maxLength={14} />
              <TextField name="shelfLife" label="Shelf life" defaultValue={product?.shelfLife} error={fieldErrors.shelfLife} maxLength={100} placeholder="e.g. 6 months" />
            </div>
            <Field data-invalid={invalid("ingredients")}>
              <FieldLabel htmlFor="product-ingredients">Ingredients</FieldLabel>
              <Textarea id="product-ingredients" name="ingredients" defaultValue={product?.ingredients ?? ""} maxLength={2000} rows={3} aria-invalid={invalid("ingredients")} />
              <FieldError>{fieldErrors.ingredients}</FieldError>
            </Field>
          </FieldGroup>
        </FieldSet>

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
