"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Check, ImageIcon, ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { uploadImage } from "@/app/(dashboard)/actions";
import { addProductImage, saveProductChanges, setImageVariant } from "@/app/(dashboard)/products/actions";
import { PricingCard, StockCard } from "@/components/catalog/price-stock";
import { CodeFields, pricePart, stockPart, TextField } from "@/components/catalog/product-editor";
import { StockHistoryDialog } from "@/components/inventory/inventory-controls";
import { PageHeader } from "@/components/page-header";
import { SaveBar } from "@/components/save-bar";
import { Block, Panel } from "@/components/section";
import { Pill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { toastResult } from "@/lib/action-toast";
import { formatMoney, productTitle } from "@/lib/format";
import { priceDraftFor, priceDraftsFromListings, priceRange, priceRows, totalStock, type PriceDraft, type PriceRow, type StockRow } from "@/lib/product-editor";
import type { ProductDetail, ProductImage, ProductListings, Store } from "@/lib/types";
import { cn } from "@/lib/utils";
import { draftFromProduct, toPayload, variantLabel, type Draft, type VariantDraft } from "@/lib/variant-drafts";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_IMAGES = 20;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function Thumb({ url, className }: { url: string | null | undefined; className?: string }) {
  return (
    <span className={cn("flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-muted-foreground", className)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- uploaded or admin-entered URLs from any host
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <ImageIcon className="size-4" aria-hidden />
      )}
    </span>
  );
}

/** Which of the product's photos show first for this size; picking one saves at once. */
function SizePhotos({ product, variantId }: { product: ProductDetail; variantId: string }) {
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const label = (image: ProductImage) =>
    image.variantId === null ? "Every size" : (product.variants.find((variant) => variant.id === image.variantId)?.label ?? "Another size");

  function toggle(image: ProductImage) {
    startTransition(async () => {
      toastResult(
        await setImageVariant({ productId: product.id, imageId: image.id, variantId: image.variantId === variantId ? null : variantId }),
      );
    });
  }

  function upload(file: File) {
    if (file.size > MAX_BYTES) {
      toast.error(`${file.name} is larger than 10 MB`);
      return;
    }
    startTransition(async () => {
      const formData = new FormData();
      formData.set("file", file);
      const uploaded = await uploadImage(formData);
      if (!uploaded.ok) {
        toast.error(uploaded.error);
        return;
      }
      toastResult(await addProductImage({ productId: product.id, url: uploaded.url, variantId }));
    });
  }

  return (
    <Block title="Photo" hint="Tap a photo to show it first for this size. Tap again to share it with every size. Saves straight away.">
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {product.images.map((image) => {
          const mine = image.variantId === variantId;
          return (
            <li key={image.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() => toggle(image)}
                aria-pressed={mine}
                className={cn(
                  "group relative block aspect-square w-full overflow-hidden rounded-lg border-2 bg-muted transition-colors",
                  mine ? "border-primary" : "border-transparent hover:border-muted-foreground/40",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- uploaded or admin-entered URLs from any host */}
                <img src={image.url} alt={image.altText ?? ""} className={cn("size-full object-cover", !mine && image.variantId && "opacity-50")} />
                {mine && (
                  <span className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-4" strokeWidth={3} aria-hidden />
                  </span>
                )}
                <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white">
                  {mine ? "This size" : label(image)}
                </span>
              </button>
            </li>
          );
        })}
        {product.images.length < MAX_IMAGES && (
          <li>
            <button
              type="button"
              disabled={pending}
              onClick={() => fileInput.current?.click()}
              className="flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:bg-primary-soft hover:text-primary-ink"
            >
              {pending ? <Loader2 className="size-6 animate-spin" /> : <ImagePlus className="size-6" />}
              {pending ? "Saving…" : "Upload"}
            </button>
          </li>
        )}
      </ul>
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) upload(file);
        }}
      />
    </Block>
  );
}

/** Sets a size's value for one option, keeping the option's list of values in step. */
function setOptionValue(draft: Draft, variantKey: string, optionKey: string, value: string): Draft {
  const old = draft.variants.find((variant) => variant.key === variantKey)?.values[optionKey] ?? "";
  const variants = draft.variants.map((variant) =>
    variant.key === variantKey ? { ...variant, values: { ...variant.values, [optionKey]: value } } : variant,
  );
  const options = draft.options.map((option) => {
    if (option.key !== optionKey) return option;
    const used = new Set(variants.map((variant) => variant.values[optionKey] ?? ""));
    // A renamed value keeps its place in the list.
    const values = option.values
      .map((existing) => (existing === old && !used.has(old) && value && !option.values.includes(value) ? value : existing))
      .filter((existing) => used.has(existing));
    for (const candidate of used) if (candidate && !values.includes(candidate)) values.push(candidate);
    return { ...option, values };
  });
  return { options, variants };
}

type VariantEditorProps = {
  product: ProductDetail;
  listings: ProductListings;
  variantId: string;
  currency: string;
  timezone: string;
};

export function VariantEditor({ product, listings, variantId, currency, timezone }: VariantEditorProps) {
  const [pending, startTransition] = useTransition();
  const stores: Store[] = listings.items.map((item) => item.store);
  const [initial] = useState(() => {
    const prices = priceDraftsFromListings(listings);
    return { draft: draftFromProduct(product), prices, price: prices[variantId] ?? priceDraftFor(stores, () => null) };
  });
  const [draft, setDraft] = useState<Draft>(initial.draft);
  const [price, setPrice] = useState<PriceDraft>(initial.price);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const index = draft.variants.findIndex((variant) => variant.id === variantId);
  const variant = draft.variants[index]!;
  const saved = product.variants.find((candidate) => candidate.id === variantId)!;
  const prefix = `variants.${index}`;
  const label = variantLabel(draft.options, variant) || saved.label || "Size";
  const duplicate = draft.variants.some(
    (other) => other.key !== variant.key && draft.options.every((option) => (other.values[option.key] ?? "").toLowerCase() === (variant.values[option.key] ?? "").toLowerCase()),
  );

  const variantsDirty = !same(toPayload(draft), toPayload(initial.draft));
  const priceDirty = !same(pricePart(price), pricePart(initial.price));
  const stockDirty = !same(stockPart(price), stockPart(initial.price));
  const dirty = variantsDirty || priceDirty || stockDirty;

  const update = (changes: Partial<VariantDraft>) =>
    setDraft({ ...draft, variants: draft.variants.map((candidate) => (candidate.key === variant.key ? { ...candidate, ...changes } : candidate)) });
  const field = (name: "quantity" | "unit" | "maxOrderQuantity") => ({
    id: `variant-${name}`,
    value: variant[name],
    onValue: (value: string) => update({ [name]: value }),
    error: errors[`${prefix}.${name}`],
  });

  function discard() {
    setDraft(initial.draft);
    setPrice(initial.price);
    setErrors({});
  }

  function save() {
    if (duplicate) {
      toast.error("Another size already has these options");
      return;
    }
    if (draft.options.some((option) => !(variant.values[option.key] ?? "").trim())) {
      toast.error("Fill in every option");
      return;
    }
    let prices: PriceRow[] | undefined;
    let stock: StockRow[] | undefined;
    if (priceDirty || stockDirty) {
      const result = priceRows(variantId, price, stores);
      if (Object.keys(result.errors).length > 0) {
        setErrors(result.errors);
        toast.error("Check the highlighted boxes");
        return;
      }
      prices = priceDirty ? result.rows : undefined;
      stock = result.stock;
    }
    startTransition(async () => {
      const result = await saveProductChanges({ productId: product.id, variants: variantsDirty ? toPayload(draft) : undefined, prices, stock });
      if (result.ok) {
        setErrors({});
        toast.success(result.message);
      } else {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
      }
    });
  }

  const mainImage = product.images.find((image) => image.variantId === null)?.url ?? product.images[0]?.url;
  const imageFor = (id: string) => product.images.find((image) => image.variantId === id)?.url ?? mainImage;
  const money = (value: number) => formatMoney(String(value), currency);

  return (
    <>
      <SaveBar visible={dirty} pending={pending} onSave={save} onDiscard={discard} />
      <PageHeader
        back={{ href: `/products/${product.id}`, label: product.name }}
        title={label}
        description={productTitle(product.name, saved.label)}
        status={
          !variant.isActive ? (
            <Pill tone="gray" size="md">
              Switched off
            </Pill>
          ) : undefined
        }
      />

      <div className="grid w-full max-w-6xl items-start gap-5 px-4 pt-4 pb-16 md:px-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="order-last flex min-w-0 flex-col gap-5 lg:order-first">
          <Panel className="flex items-center gap-3 p-4">
            <Thumb url={mainImage} className="size-14" />
            <div className="min-w-0">
              <Link href={`/products/${product.id}`} className="font-semibold hover:underline">
                {product.name}
              </Link>
              <p className="text-sm text-muted-foreground">
                {product.variants.length} {product.variants.length === 1 ? "size" : "sizes"}
              </p>
            </div>
          </Panel>
          <Panel className="overflow-hidden">
            <h2 className="border-b px-4 py-3 font-semibold">Sizes</h2>
            <ul className="divide-y">
              {listings.variants.map((entry) => {
                const current = entry.id === variantId;
                const range = priceRange(initial.prices[entry.id]);
                const stock = totalStock(initial.prices[entry.id]);
                return (
                  <li key={entry.id}>
                    <Link
                      href={`/products/${product.id}/variants/${entry.id}`}
                      aria-current={current ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted/60",
                        current && "bg-primary-soft text-primary-ink hover:bg-primary-soft",
                      )}
                    >
                      <Thumb url={imageFor(entry.id)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{entry.label || entry.sku}</span>
                        <span className={cn("block text-xs", current ? "text-primary-ink/80" : "text-muted-foreground")}>
                          {range ? (range.min === range.max ? money(range.min) : `${money(range.min)} – ${money(range.max)}`) : "No price"}
                          {range && ` · ${stock === 0 ? "out of stock" : `${stock} in stock`}`}
                        </span>
                      </span>
                      {!entry.isActive && <Pill tone="gray">Off</Pill>}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="border-t p-3">
              <Button asChild variant="ghost" size="sm" className="w-full">
                <Link href={`/products/${product.id}`}>Add or remove sizes</Link>
              </Button>
            </div>
          </Panel>
        </aside>

        <div className="flex min-w-0 flex-col gap-5">
          {draft.options.length > 0 && (
            <Block title="Options">
              <div className="grid gap-4 sm:grid-cols-2">
                {draft.options.map((option) => (
                  <div key={option.key}>
                    <TextField
                      id={`option-${option.key}`}
                      label={option.name}
                      value={variant.values[option.key] ?? ""}
                      onValue={(value) => setDraft(setOptionValue(draft, variant.key, option.key, value))}
                      maxLength={50}
                      list={`option-${option.key}-values`}
                    />
                    <datalist id={`option-${option.key}-values`}>
                      {option.values.map((value) => (
                        <option key={value} value={value} />
                      ))}
                    </datalist>
                  </div>
                ))}
              </div>
              {duplicate && <p className="text-sm text-destructive">Another size already has these options.</p>}
            </Block>
          )}

          <SizePhotos product={product} variantId={variantId} />

          <PricingCard variantId={variantId} stores={stores} draft={price} onChange={setPrice} errors={errors} currency={currency} />
          <StockCard
            variantId={variantId}
            stores={stores}
            draft={price}
            onChange={setPrice}
            errors={errors}
            codes={<CodeFields variant={variant} onChange={update} errors={errors} errorPrefix={prefix} />}
            history={(storeId) => (
              <StockHistoryDialog storeId={storeId} variantId={variantId} title={productTitle(product.name, saved.label)} timezone={timezone} />
            )}
          />

          <Block title="Pack">
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField label="Pack size" inputMode="decimal" placeholder="e.g. 500" {...field("quantity")} />
              <TextField label="Unit" maxLength={20} placeholder="g, kg, ml, L, pcs" {...field("unit")} />
              <TextField label="Max per order" inputMode="numeric" placeholder="No limit" {...field("maxOrderQuantity")} />
            </div>
            <Field orientation="horizontal" className="items-start border-t pt-4">
              <Switch id="variant-active" checked={variant.isActive} onCheckedChange={(isActive) => update({ isActive })} className="mt-0.5" />
              <div className="flex flex-col gap-0.5">
                <FieldLabel htmlFor="variant-active">Size switched on</FieldLabel>
                <FieldDescription>Turn off to stop selling this size at every store, without deleting it.</FieldDescription>
              </div>
            </Field>
          </Block>
        </div>
      </div>
    </>
  );
}
