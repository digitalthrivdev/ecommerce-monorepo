"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { createProduct, saveProductChanges } from "@/app/(dashboard)/products/actions";
import { DraftImages, ImagesManager } from "@/components/catalog/images-manager";
import { PricingCard, StockCard } from "@/components/catalog/price-stock";
import { VariantsCard } from "@/components/catalog/variants-card";
import { StockHistoryDialog } from "@/components/inventory/inventory-controls";
import { PageHeader } from "@/components/page-header";
import { SaveBar } from "@/components/save-bar";
import { Block, Panel } from "@/components/section";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { categoryOptions } from "@/lib/categories";
import { productTitle } from "@/lib/format";
import {
  closestVariant,
  copyPriceDraft,
  detailsFromProduct,
  NONE,
  priceDraftFor,
  priceDraftsFromListings,
  priceRows,
  type DetailsDraft,
  type PriceDraft,
  type PriceRow,
  type StockRow,
} from "@/lib/product-editor";
import type { Brand, Category, ProductDetail, ProductListings, Store } from "@/lib/types";
import { cn } from "@/lib/utils";
import { draftFromProduct, toPayload, type Draft, type VariantDraft } from "@/lib/variant-drafts";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The parts of a price draft saved as prices; stock is saved separately. */
export const pricePart = (draft: PriceDraft) => ({
  same: draft.same,
  price: draft.price,
  mrp: draft.mrp,
  stores: Object.entries(draft.stores).map(([storeId, row]) => [storeId, row.price, row.mrp, row.selling]),
});
export const stockPart = (draft: PriceDraft) => Object.values(draft.stores).map((row) => row.stock);

const FIRST_VARIANT_FIELDS = ["sku", "barcode", "quantity", "unit", "maxOrderQuantity"];

function emptyDraft(): Draft {
  return {
    options: [],
    variants: [{ key: "first", values: {}, sku: "", barcode: "", quantity: "", unit: "", maxOrderQuantity: "", isActive: true }],
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

const FOOD_TYPES = [
  { value: "veg", label: "Veg", dot: "bg-green-600" },
  { value: "non-veg", label: "Non-veg", dot: "bg-red-600" },
  { value: NONE, label: "Not food", dot: null },
] as const;

function FoodType({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Field>
      <FieldTitle>Food type</FieldTitle>
      <div role="radiogroup" aria-label="Food type" className="flex flex-wrap gap-1.5">
        {FOOD_TYPES.map((type) => (
          <label
            key={type.value}
            className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-input bg-card px-2.5 text-sm font-medium shadow-xs transition-colors hover:bg-muted has-checked:border-primary has-checked:bg-primary-soft has-checked:text-primary-ink has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
          >
            <input type="radio" name="isVeg" value={type.value} checked={value === type.value} onChange={() => onChange(type.value)} className="sr-only" />
            {type.dot && (
              <span className="flex size-4 items-center justify-center rounded-[3px] border-2 border-current" aria-hidden>
                <span className={cn("size-1.5 rounded-full", type.dot)} />
              </span>
            )}
            {type.label}
          </label>
        ))}
      </div>
    </Field>
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

const LABEL_KEYS = ["manufacturerName", "manufacturerAddress", "countryOfOrigin", "fssaiLicense", "shelfLife", "ingredients"] as const;

type ProductEditorProps = {
  /** Absent when adding a product. */
  product?: ProductDetail;
  listings?: ProductListings;
  stores: Store[];
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
export function ProductEditor({ product, listings, stores, categories, brands, currency, timezone, description, status, actions }: ProductEditorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [initial] = useState(() => {
    const draft = product ? draftFromProduct(product) : emptyDraft();
    const loaded = listings ? priceDraftsFromListings(listings) : {};
    const prices = Object.fromEntries(draft.variants.map((variant) => [variant.key, loaded[variant.key] ?? priceDraftFor(stores, () => null)]));
    return { details: detailsFromProduct(product), draft, prices };
  });
  const [details, setDetails] = useState<DetailsDraft>(initial.details);
  const [draft, setDraft] = useState<Draft>(initial.draft);
  /** Price and stock of every size, keyed by variant key (the id once saved). */
  const [prices, setPrices] = useState<Record<string, PriceDraft>>(initial.prices);
  const [newImages, setNewImages] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const creating = !product;
  const first = draft.variants[0]!;
  /** With one size, its price and stock sit on this page; with more, they are in the sizes list. */
  const showPricing = draft.options.length === 0;

  const priceChanged = (variant: VariantDraft) => {
    const was = initial.prices[variant.key];
    const now = prices[variant.key];
    return {
      price: Boolean(was && now && !same(pricePart(now), pricePart(was))),
      stock: Boolean(was && now && !same(stockPart(now), stockPart(was))),
    };
  };
  const detailsDirty = !same(details, initial.details);
  const variantsDirty = !same(toPayload(draft), toPayload(initial.draft));
  const pricesDirty = draft.variants.some((variant) => {
    const changed = priceChanged(variant);
    return changed.price || changed.stock;
  });
  const dirty = detailsDirty || variantsDirty || pricesDirty || newImages.length > 0;

  const set = (changes: Partial<DetailsDraft>) => setDetails((current) => ({ ...current, ...changes }));
  const field = (name: keyof Omit<DetailsDraft, "isActive">) => ({
    id: `product-${name}`,
    value: details[name],
    onValue: (value: string) => set({ [name]: value }),
    error: errors[name],
  });
  const updateFirst = (changes: Partial<VariantDraft>) => setDraft({ ...draft, variants: [{ ...first, ...changes }, ...draft.variants.slice(1)] });

  /** New sizes start with the price of the closest size, so nobody has to type every price. */
  function changeDraft(next: Draft) {
    const missing = next.variants.filter((variant) => !prices[variant.key]);
    if (missing.length > 0) {
      const filled = { ...prices };
      for (const variant of missing) {
        const source = closestVariant(next, variant, (candidate) => Boolean(prices[candidate.key]));
        filled[variant.key] = copyPriceDraft(source && prices[source.key], stores);
      }
      setPrices(filled);
    }
    setDraft(next);
  }

  function discard() {
    setDetails(initial.details);
    setDraft(initial.draft);
    setPrices(initial.prices);
    setNewImages([]);
    setErrors({});
  }

  /** Price and stock rows of every changed or new size, or null after showing what to fix. */
  function checkPrices(): { prices: PriceRow[]; stock: StockRow[] } | null {
    const rows: PriceRow[] = [];
    const stock: StockRow[] = [];
    const problems: Record<string, string> = {};
    for (const variant of draft.variants) {
      const pd = prices[variant.key];
      const changed = priceChanged(variant);
      const isNew = !variant.id;
      if (!pd || (!isNew && !changed.price && !changed.stock)) continue;
      const result = priceRows(variant.key, pd, stores);
      Object.assign(problems, result.errors);
      const ref = isNew ? { variantId: "", sku: variant.sku.trim().toUpperCase() } : { variantId: variant.key };
      if (isNew || changed.price) rows.push(...result.rows.map((row) => ({ ...row, ...ref })));
      stock.push(...result.stock.map((row) => ({ ...row, ...ref })));
    }
    if (Object.keys(problems).length > 0) {
      setErrors(problems);
      toast.error("Check the highlighted boxes");
      return null;
    }
    return { prices: rows, stock };
  }

  function save() {
    const checked = checkPrices();
    if (!checked) return;
    if (creating) {
      startTransition(async () => {
        const result = await createProduct({
          details,
          variant: { sku: first.sku, barcode: first.barcode, quantity: first.quantity, unit: first.unit, maxOrderQuantity: first.maxOrderQuantity },
          prices: checked.prices,
          stock: checked.stock,
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
        prices: checked.prices,
        stock: checked.stock,
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

  const listedCount = listings?.items.filter((item) => item.listings.some((entry) => entry.listing)).length ?? 0;
  const labelOpen = LABEL_KEYS.some((key) => initial.details[key] || errors[key]);

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
              <TextField label="Name" maxLength={200} placeholder="e.g. Amul Taaza Toned Milk" {...field("name")} />
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

          {showPricing && prices[first.key] && (
            <>
              <PricingCard
                variantId={first.key}
                stores={stores}
                draft={prices[first.key]!}
                onChange={(next) => setPrices({ ...prices, [first.key]: next })}
                errors={errors}
                currency={currency}
              />
              <StockCard
                variantId={first.key}
                stores={stores}
                draft={prices[first.key]!}
                onChange={(next) => setPrices({ ...prices, [first.key]: next })}
                errors={errors}
                codes={<CodeFields variant={first} onChange={updateFirst} errors={errors} errorPrefix="variants.0" creating={creating} />}
                history={
                  product && first.id
                    ? (storeId) => (
                        <StockHistoryDialog
                          storeId={storeId}
                          variantId={first.id!}
                          title={productTitle(product.name, product.variants.find((variant) => variant.id === first.id)?.label ?? "")}
                          timezone={timezone}
                        />
                      )
                    : undefined
                }
              />
            </>
          )}

          {stores.length === 0 && <p className="text-sm text-muted-foreground">Add a store on the Stores page to set a price and stock.</p>}

          <VariantsCard
            productId={product?.id}
            slug={details.slug || product?.slug || details.name}
            images={product?.images ?? []}
            draft={draft}
            onChange={changeDraft}
            errors={errors}
            stores={stores}
            prices={prices}
            onPricesChange={setPrices}
            currency={currency}
          />

          <Folded summary="Label details (optional)" hint="Maker, FSSAI number, ingredients: as printed on the pack." defaultOpen={labelOpen}>
            <FieldGroup>
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField label="Made by" maxLength={200} {...field("manufacturerName")} />
                <TextField label="Country of origin" maxLength={100} placeholder="e.g. India" {...field("countryOfOrigin")} />
              </div>
              <TextField label="Maker's address" maxLength={500} {...field("manufacturerAddress")} />
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField label="FSSAI licence number" inputMode="numeric" maxLength={14} {...field("fssaiLicense")} />
                <TextField label="Shelf life" maxLength={100} placeholder="e.g. 6 months" {...field("shelfLife")} />
              </div>
              <Field data-invalid={Boolean(errors.ingredients)}>
                <FieldLabel htmlFor="product-ingredients">Ingredients</FieldLabel>
                <Textarea
                  id="product-ingredients"
                  value={details.ingredients}
                  onChange={(event) => set({ ingredients: event.target.value })}
                  maxLength={2000}
                  rows={3}
                  aria-invalid={Boolean(errors.ingredients)}
                />
                <FieldError>{errors.ingredients}</FieldError>
              </Field>
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
              {details.isActive ? "Customers see it at stores that sell it." : "Customers can't see it at any store."}
            </p>
            {listings && (
              <p className="border-t pt-3 text-sm">
                Selling at <span className="font-semibold">{listedCount}</span> of {listings.items.length}{" "}
                {listings.items.length === 1 ? "store" : "stores"}
              </p>
            )}
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

              <FoodType value={details.isVeg} onChange={(isVeg) => set({ isVeg })} />

              <TextField
                label="Other names people search for"
                placeholder="e.g. doodh, toned milk"
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
