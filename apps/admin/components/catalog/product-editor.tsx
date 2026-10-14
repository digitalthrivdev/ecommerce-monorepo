"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { ChevronDown, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { createProduct, saveProductChanges } from "@/app/(dashboard)/products/actions";
import { DraftImages, ImagesManager } from "@/components/catalog/images-manager";
import { ParcelCard, PriceCard, StockCard } from "@/components/catalog/variant-cards";
import { VariantsCard } from "@/components/catalog/variants-card";
import { StockHistoryDialog } from "@/components/inventory/inventory-controls";
import { PageHeader } from "@/components/page-header";
import { SaveBar } from "@/components/save-bar";
import { Block, Panel } from "@/components/section";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { categoryOptions } from "@/lib/categories";
import { productTitle } from "@/lib/format";
import { detailsFromProduct, fillNewVariants, MAX_SPECIFICATIONS, NONE, type DetailsDraft } from "@/lib/product-editor";
import type { Brand, Category, ProductDetail, ProductSpecification } from "@/lib/types";
import { draftFromProduct, toPayload, variantsProblems, type Draft, type VariantDraft } from "@/lib/variant-drafts";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const FIRST_VARIANT_FIELDS = [
  "sku",
  "barcode",
  "quantity",
  "unit",
  "maxOrderQuantity",
  "price",
  "compareAtPrice",
  "weightGrams",
  "lengthCm",
  "breadthCm",
  "heightCm",
];

function emptyDraft(): Draft {
  return {
    options: [],
    variants: [
      {
        key: "first",
        values: {},
        sku: "",
        barcode: "",
        quantity: "",
        unit: "",
        maxOrderQuantity: "",
        price: "",
        compareAtPrice: "",
        weightGrams: "",
        lengthCm: "",
        breadthCm: "",
        heightCm: "",
        isActive: true,
      },
    ],
  };
}

type TextFieldProps = {
  id: string;
  label: ReactNode;
  value: string;
  onValue: (value: string) => void;
  error?: string;
  description?: string;
} & Omit<React.ComponentProps<typeof Input>, "id" | "value" | "onChange">;

export function TextField({ id, label, value, onValue, error, description, ...props }: TextFieldProps) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} value={value} onChange={(event) => onValue(event.target.value)} aria-invalid={Boolean(error)} {...props} />
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError>{error}</FieldError>
    </Field>
  );
}

/** Product code and barcode of one size, shown at the top of the Stock card. */
export function CodeFields({
  variant,
  onChange,
  errors,
  errorPrefix,
  creating = false,
}: {
  variant: VariantDraft;
  onChange: (changes: Partial<VariantDraft>) => void;
  errors: Record<string, string>;
  errorPrefix: string;
  creating?: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        id={`${variant.key}-sku`}
        label="Product code"
        value={variant.sku}
        onValue={(sku) => onChange({ sku })}
        error={errors[`${errorPrefix}.sku`]}
        maxLength={64}
        placeholder={creating ? "Made from the name if empty" : undefined}
        className="uppercase placeholder:normal-case"
        description="Your own code, used when searching stock."
      />
      <TextField
        id={`${variant.key}-barcode`}
        label="Barcode"
        value={variant.barcode}
        onValue={(barcode) => onChange({ barcode })}
        error={errors[`${errorPrefix}.barcode`]}
        maxLength={32}
        placeholder="Optional"
        description="The number under the bars on the pack."
      />
    </div>
  );
}

/** A card whose content opens on tap, for optional fields most people skip. */
function Folded({ summary, hint, defaultOpen, children }: { summary: string; hint: string; defaultOpen: boolean; children: ReactNode }) {
  return (
    <Panel>
      <details open={defaultOpen} className="group">
        <summary className="flex cursor-pointer list-none items-center gap-3 p-5 [&::-webkit-details-marker]:hidden">
          <div className="flex-1">
            <div className="font-semibold">{summary}</div>
            <div className="text-sm text-muted-foreground">{hint}</div>
          </div>
          <ChevronDown className="size-5 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="border-t p-5">{children}</div>
      </details>
    </Panel>
  );
}

const MAKER_KEYS = ["manufacturerName", "manufacturerAddress", "countryOfOrigin"] as const;

/** Name and value rows shown on the product page, e.g. Material: Cotton. Empty rows are dropped on save. */
function SpecificationsEditor({ rows, onChange, error }: { rows: ProductSpecification[]; onChange: (rows: ProductSpecification[]) => void; error?: string }) {
  const update = (index: number, changes: Partial<ProductSpecification>) =>
    onChange(rows.map((row, candidate) => (candidate === index ? { ...row, ...changes } : row)));

  return (
    <Block title="Specifications" hint="Details shown on the product page, like material or warranty. Optional.">
      {rows.length > 0 && (
        <ul className="flex flex-col gap-2">
          {rows.map((row, index) => (
            <li key={index} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] items-center gap-2">
              <Input value={row.name} onChange={(event) => update(index, { name: event.target.value })} maxLength={50} placeholder="e.g. Material" aria-label={`Specification ${index + 1} name`} />
              <Input value={row.value} onChange={(event) => update(index, { value: event.target.value })} maxLength={500} placeholder="e.g. Cotton" aria-label={`Specification ${index + 1} value`} />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                aria-label={`Remove specification ${index + 1}`}
                onClick={() => onChange(rows.filter((_, candidate) => candidate !== index))}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div>
        <Button type="button" variant="outline" size="sm" disabled={rows.length >= MAX_SPECIFICATIONS} onClick={() => onChange([...rows, { name: "", value: "" }])}>
          <Plus />
          Add specification
        </Button>
      </div>
    </Block>
  );
}

type ProductEditorProps = {
  /** Absent when adding a product. */
  product?: ProductDetail;
  categories: Category[];
  brands: Brand[];
  currency: string;
  timezone: string;
  /** Under the page title, e.g. the category path. */
  description?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
};

/**
 * The product page: details on the left, status and organizing on the right, and one
 * "Unsaved changes" bar for everything except photos, which save as soon as they are added.
 */
export function ProductEditor({ product, categories, brands, currency, timezone, description, status, actions }: ProductEditorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [initial] = useState(() => ({ details: detailsFromProduct(product), draft: product ? draftFromProduct(product) : emptyDraft() }));
  const [details, setDetails] = useState<DetailsDraft>(initial.details);
  const [draft, setDraft] = useState<Draft>(initial.draft);
  const [newImages, setNewImages] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const creating = !product;
  const first = draft.variants[0]!;
  /** With one size, its price and stock sit on this page; with more, they are in the sizes list. */
  const showPricing = draft.options.length === 0;
  const stock = new Map(product?.variants.map((variant) => [variant.id, variant.stockQuantity]));

  const detailsDirty = !same(details, initial.details);
  const variantsDirty = !same(toPayload(draft), toPayload(initial.draft));
  const dirty = detailsDirty || variantsDirty || newImages.length > 0;

  const set = (changes: Partial<DetailsDraft>) => setDetails((current) => ({ ...current, ...changes }));
  const field = (name: keyof Omit<DetailsDraft, "isActive" | "specifications">) => ({
    id: `product-${name}`,
    value: details[name],
    onValue: (value: string) => set({ [name]: value }),
    error: errors[name],
  });
  const updateFirst = (changes: Partial<VariantDraft>) => setDraft({ ...draft, variants: [{ ...first, ...changes }, ...draft.variants.slice(1)] });

  /** New sizes start with the price of the closest size, so nobody has to type every price. */
  const changeDraft = (next: Draft) => setDraft(fillNewVariants(draft, next));

  function discard() {
    setDetails(initial.details);
    setDraft(initial.draft);
    setNewImages([]);
    setErrors({});
  }

  function save() {
    const problems = variantsDirty || creating ? variantsProblems(draft) : {};
    if (Object.keys(problems).length > 0) {
      setErrors(problems);
      toast.error("Check the highlighted boxes");
      return;
    }
    if (creating) {
      startTransition(async () => {
        const { sku, barcode, quantity, unit, maxOrderQuantity, price, compareAtPrice, weightGrams, lengthCm, breadthCm, heightCm } = first;
        const result = await createProduct({
          details,
          variant: { sku, barcode, quantity, unit, maxOrderQuantity, price, compareAtPrice, weightGrams, lengthCm, breadthCm, heightCm },
          images: newImages,
        });
        if (!result.ok) {
          setErrors(
            Object.fromEntries(
              Object.entries(result.fieldErrors ?? {}).map(([key, message]) => [FIRST_VARIANT_FIELDS.includes(key) ? `variants.0.${key}` : key, message]),
            ),
          );
          toast.error(result.error);
          return;
        }
        if (result.warning) toast.warning(result.warning);
        else toast.success("Product added");
        router.push(result.href);
      });
      return;
    }

    startTransition(async () => {
      const result = await saveProductChanges({
        productId: product.id,
        details: detailsDirty ? details : undefined,
        variants: variantsDirty ? toPayload(draft) : undefined,
      });
      if (result.ok) {
        setErrors({});
        toast.success(result.message);
      } else {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
      }
    });
  }

  const makerOpen = MAKER_KEYS.some((key) => initial.details[key] || errors[key]);

  return (
    <>
      <SaveBar
        visible={dirty}
        pending={pending}
        onSave={save}
        onDiscard={creating ? undefined : discard}
        message={creating ? "New product, not saved yet" : "Unsaved changes"}
        saveLabel={creating ? "Save product" : "Save"}
      />
      <PageHeader
        back={{ href: "/products", label: "Products" }}
        title={creating ? "Add a product" : product.name}
        description={description}
        status={status}
        actions={actions}
      />

      <div className="grid w-full max-w-6xl items-start gap-5 px-4 pt-4 pb-16 md:px-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel className="p-5">
            <FieldGroup>
              <TextField label="Name" maxLength={200} placeholder="e.g. Classic Cotton T-Shirt" {...field("name")} />
              <Field data-invalid={Boolean(errors.description)}>
                <FieldLabel htmlFor="product-description">
                  Description <span className="font-normal text-muted-foreground">(optional)</span>
                </FieldLabel>
                <Textarea
                  id="product-description"
                  value={details.description}
                  onChange={(event) => set({ description: event.target.value })}
                  maxLength={2000}
                  rows={5}
                  aria-invalid={Boolean(errors.description)}
                />
                <FieldError>{errors.description}</FieldError>
              </Field>
            </FieldGroup>
          </Panel>

          <Block title="Photos" hint={creating ? undefined : "Photos save as soon as you add them."}>
            {product ? <ImagesManager product={product} /> : <DraftImages urls={newImages} onChange={setNewImages} />}
          </Block>

          {showPricing && (
            <>
              <PriceCard variant={first} onChange={updateFirst} errors={errors} errorPrefix="variants.0" currency={currency} />
              <StockCard
                stock={first.id ? (stock.get(first.id) ?? 0) : null}
                sku={first.sku}
                codes={<CodeFields variant={first} onChange={updateFirst} errors={errors} errorPrefix="variants.0" creating={creating} />}
                history={
                  product &&
                  first.id && (
                    <StockHistoryDialog
                      variantId={first.id}
                      title={productTitle(product.name, product.variants.find((variant) => variant.id === first.id)?.label ?? "")}
                      timezone={timezone}
                    />
                  )
                }
              />
            </>
          )}

          <VariantsCard
            productId={product?.id}
            slug={details.slug || product?.slug || details.name}
            images={product?.images ?? []}
            draft={draft}
            onChange={changeDraft}
            errors={errors}
            stock={stock}
            currency={currency}
          />

          {showPricing && <ParcelCard variant={first} onChange={updateFirst} errors={errors} errorPrefix="variants.0" />}

          <SpecificationsEditor rows={details.specifications} onChange={(specifications) => set({ specifications })} error={errors.specifications} />

          <Folded summary="Maker details (optional)" hint="Who made it and where, as printed on the pack or label." defaultOpen={makerOpen}>
            <FieldGroup>
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField label="Made by" maxLength={200} {...field("manufacturerName")} />
                <TextField label="Country of origin" maxLength={100} placeholder="e.g. India" {...field("countryOfOrigin")} />
              </div>
              <TextField label="Maker's address" maxLength={500} {...field("manufacturerAddress")} />
            </FieldGroup>
          </Folded>

          <Folded summary="Web address (advanced)" hint="The name used in links to this product. Usually leave as is." defaultOpen={Boolean(errors.slug)}>
            <div className="max-w-md">
              <TextField label="Web address name" maxLength={100} placeholder="Made from the name" {...field("slug")} />
            </div>
          </Folded>

          {creating && (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" size="lg" disabled={pending} onClick={save}>
                {pending && <Loader2 className="animate-spin" />}
                Save product
              </Button>
              <p className="text-sm text-muted-foreground">You can add more sizes after saving.</p>
            </div>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-5">
          <Block title="Status">
            <Select value={details.isActive ? "active" : "hidden"} onValueChange={(value) => set({ isActive: value === "active" })}>
              <SelectTrigger className="w-full" aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Show in app</SelectItem>
                <SelectItem value="hidden">Hidden</SelectItem>
              </SelectContent>
            </Select>
            <p className="-mt-1 text-sm text-muted-foreground">
              {details.isActive ? "Customers see it in the app." : "Customers can't see it."}
            </p>
          </Block>

          <Block title="Organize">
            <FieldGroup className="gap-5">
              <Field data-invalid={Boolean(errors.categoryId)}>
                <FieldLabel htmlFor="product-category">Category</FieldLabel>
                <Select value={details.categoryId} onValueChange={(categoryId) => set({ categoryId })}>
                  <SelectTrigger id="product-category" className="w-full" aria-invalid={Boolean(errors.categoryId)}>
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
                <FieldError>{errors.categoryId}</FieldError>
              </Field>

              <Field data-invalid={Boolean(errors.brandId)}>
                <FieldLabel htmlFor="product-brand">Brand</FieldLabel>
                <Select value={details.brandId} onValueChange={(brandId) => set({ brandId })}>
                  <SelectTrigger id="product-brand" className="w-full" aria-invalid={Boolean(errors.brandId)}>
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
                <FieldError>{errors.brandId}</FieldError>
              </Field>

              <TextField
                label="Other names people search for"
                placeholder="e.g. tee, cotton top"
                description="Separate with commas."
                {...field("tags")}
              />
            </FieldGroup>
          </Block>

          <Block title="Tax (GST)" hint="Your prices already include GST.">
            <div className="grid grid-cols-2 gap-4">
              <TextField label="GST rate (%)" inputMode="decimal" placeholder="e.g. 5" description="0 for exempt goods." required {...field("gstRate")} />
              <TextField label="HSN code" inputMode="numeric" maxLength={8} placeholder="e.g. 0401" {...field("hsnCode")} />
            </div>
          </Block>
        </aside>
      </div>
    </>
  );
}
