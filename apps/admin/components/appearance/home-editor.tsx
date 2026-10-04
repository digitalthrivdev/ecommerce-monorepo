"use client";

import {
  ArrowDown,
  ArrowUp,
  Award,
  BadgePercent,
  ChevronDown,
  GalleryHorizontal,
  Grid2x2,
  LayoutDashboard,
  LayoutGrid,
  Megaphone,
  Plus,
  RotateCcw,
  Rows3,
  Shapes,
  Tags,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import { CategoryTabsEditor } from "@/components/appearance/category-tabs-editor";
import { ColorField } from "@/components/appearance/color-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ImageField } from "@/components/image-field";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { newCollectionItem, newId, newSection, newTile, SECTION_LABELS } from "@/lib/appearance";
import type {
  Appearance,
  AppearanceLink,
  Brand,
  Category,
  CollectionItem,
  HomeBanner,
  HomeSection,
  HomeSectionType,
  HomeTile,
  SectionBackground,
  SectionEdge,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const SECTION_ICONS: Record<HomeSectionType, LucideIcon> = {
  banner_carousel: GalleryHorizontal,
  category_grid: LayoutGrid,
  product_rail: Rows3,
  offer_strip: Megaphone,
  deals_rail: BadgePercent,
  buy_again: RotateCcw,
  brand_rail: Award,
  category_deals: Tags,
  image_tiles: Grid2x2,
  subcategory_grid: LayoutDashboard,
  category_collection: Shapes,
};

const MAX_SECTIONS = 20;
const MAX_BANNERS = 10;
const MAX_TILES = 9;
const MAX_COLLECTION_ITEMS = 24;
const ALL_CATEGORIES = "all";

type Errors = Record<string, string>;

function move<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

function TextInput({
  label,
  value,
  onChange,
  error,
  description,
  ...props
}: { label: string; value: string; onChange: (value: string) => void; error?: string; description?: string } & Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange"
>) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel>{label}</FieldLabel>
      <Input value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} {...props} />
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError>{error}</FieldError>
    </Field>
  );
}

function DescriptionInput({ value, onChange, error }: { value: string | null; onChange: (description: string | null) => void; error?: string }) {
  return (
    <TextInput
      label="Description (optional)"
      maxLength={100}
      placeholder="A short line under the title"
      value={value ?? ""}
      onChange={(description) => onChange(description || null)}
      error={error}
    />
  );
}

function CategorySelect({
  label,
  value,
  onChange,
  categories,
  error,
  allowNone,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  categories: Category[];
  error?: string;
  allowNone?: boolean;
}) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel>{label}</FieldLabel>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger className="w-full" aria-invalid={Boolean(error)}>
          <SelectValue placeholder="Choose a category" />
        </SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value="none">Nothing (not tappable)</SelectItem>}
          {categories.map((category) => (
            <SelectItem key={category.id} value={category.id}>
              {allowNone ? `Open ${category.name}` : category.name}
              {!category.isActive && " (hidden)"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError>{error}</FieldError>
    </Field>
  );
}

function LinkSelect({ link, onChange, categories, error }: { link: AppearanceLink; onChange: (link: AppearanceLink) => void; categories: Category[]; error?: string }) {
  return (
    <CategorySelect
      label="When tapped"
      allowNone
      value={link.type === "category" ? link.categoryId : "none"}
      onChange={(value) => onChange(value === "none" ? { type: "none" } : { type: "category", categoryId: value })}
      categories={categories}
      error={error}
    />
  );
}

type PickerOption = { id: string; name: string; isActive: boolean };

/** Optional "use all" switch plus a checklist that keeps the order items were ticked in. */
function OrderedPicker({
  id,
  allLabel,
  description,
  options,
  selected,
  defaultSelection,
  onChange,
  error,
}: {
  id: string;
  allLabel: string;
  description: string;
  options: PickerOption[];
  selected: string[];
  defaultSelection: number;
  onChange: (ids: string[]) => void;
  error?: string;
}) {
  const chooseAll = selected.length === 0;
  return (
    <>
      <Field orientation="horizontal">
        <Switch
          id={id}
          checked={chooseAll}
          onCheckedChange={(all) =>
            onChange(all ? [] : options.filter((option) => option.isActive).slice(0, defaultSelection).map((option) => option.id))
          }
        />
        <FieldLabel htmlFor={id}>{allLabel}</FieldLabel>
      </Field>
      {!chooseAll && (
        <Field data-invalid={Boolean(error)}>
          <FieldDescription>{description}</FieldDescription>
          <div className="grid gap-1 sm:grid-cols-2">
            {options.map((option) => {
              const position = selected.indexOf(option.id);
              const checked = position >= 0;
              return (
                <label key={option.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={checked}
                    onChange={() => onChange(checked ? selected.filter((item) => item !== option.id) : [...selected, option.id])}
                  />
                  <span className="flex-1">
                    {option.name}
                    {!option.isActive && <span className="text-muted-foreground"> (hidden)</span>}
                  </span>
                  {checked && <Badge variant="secondary">{position + 1}</Badge>}
                </label>
              );
            })}
          </div>
          <FieldError>{error}</FieldError>
        </Field>
      )}
    </>
  );
}

function TileFields({
  tile,
  index,
  count,
  carousel,
  onChange,
  onMove,
  onRemove,
  categories,
  errors,
  prefix,
}: {
  tile: HomeTile;
  index: number;
  count: number;
  carousel: boolean;
  onChange: (tile: HomeTile) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
  categories: Category[];
  errors: Errors;
  prefix: string;
}) {
  const at = (field: string) => errors[`${prefix}.${field}`];
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Tile {index + 1}</span>
        <div className="ml-auto flex gap-1">
          <Button type="button" variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => onMove(index - 1)} aria-label="Move tile up">
            <ArrowUp />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" disabled={index === count - 1} onClick={() => onMove(index + 1)} aria-label="Move tile down">
            <ArrowDown />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" disabled={count <= 2} onClick={onRemove} aria-label="Remove tile">
            <Trash2 />
          </Button>
        </div>
      </div>
      <ImageField
        id={`tile-image-${tile.id}`}
        label="Image"
        value={tile.imageUrl}
        onChange={(imageUrl) => onChange({ ...tile, imageUrl: imageUrl.trim() })}
        error={at("imageUrl")}
        description={carousel ? "Portrait image, about 4:5 (e.g. 800×1000). Put any text inside the image." : "Square image (e.g. 600×600). Put any text inside the image."}
      />
      <div className={cn("grid gap-3", carousel && "sm:grid-cols-2")}>
        <LinkSelect link={tile.link} onChange={(link) => onChange({ ...tile, link })} categories={categories} error={at("link.categoryId")} />
        {carousel && (
          <TextInput
            label="Button text (optional)"
            maxLength={20}
            placeholder="Shop now"
            value={tile.buttonLabel ?? ""}
            onChange={(buttonLabel) => onChange({ ...tile, buttonLabel: buttonLabel || null })}
            error={at("buttonLabel")}
            description={tile.link.type === "none" ? "Choose where the tile goes for the button to show." : undefined}
          />
        )}
      </div>
    </div>
  );
}

function CollectionItemFields({
  item,
  index,
  count,
  onChange,
  onMove,
  onRemove,
  categories,
  errors,
  prefix,
}: {
  item: CollectionItem;
  index: number;
  count: number;
  onChange: (item: CollectionItem) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
  categories: Category[];
  errors: Errors;
  prefix: string;
}) {
  const at = (field: string) => errors[`${prefix}.${field}`];
  const category = categories.find((candidate) => candidate.id === item.categoryId);
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Category {index + 1}</span>
        <div className="ml-auto flex gap-1">
          <Button type="button" variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => onMove(index - 1)} aria-label="Move category up">
            <ArrowUp />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" disabled={index === count - 1} onClick={() => onMove(index + 1)} aria-label="Move category down">
            <ArrowDown />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" disabled={count === 1} onClick={onRemove} aria-label="Remove category">
            <Trash2 />
          </Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[2fr_1.5fr_1fr]">
        <CategorySelect label="Opens" value={item.categoryId} onChange={(categoryId) => onChange({ ...item, categoryId })} categories={categories} error={at("categoryId")} />
        <TextInput
          label="Name (optional)"
          maxLength={24}
          placeholder={category?.name ?? "Category name"}
          value={item.label ?? ""}
          onChange={(label) => onChange({ ...item, label: label || null })}
          error={at("label")}
        />
        <TextInput label="Badge (optional)" maxLength={16} placeholder="Up to 40% OFF" value={item.badge ?? ""} onChange={(badge) => onChange({ ...item, badge: badge || null })} error={at("badge")} />
      </div>
      <ImageField
        id={`collection-image-${item.id}`}
        label="Photo (optional)"
        value={item.imageUrl ?? ""}
        onChange={(imageUrl) => onChange({ ...item, imageUrl: imageUrl.trim() || null })}
        error={at("imageUrl")}
        description={category?.imageUrl ? "Leave empty to use the category's image. Square works best." : "Square works best. Without one, the category's first letter is shown."}
      />
    </div>
  );
}

function firstNestedError(errors: Errors, prefix: string) {
  return Object.entries(errors).find(([key]) => key.startsWith(`${prefix}.`))?.[1];
}

function BannerFields({
  banner,
  index,
  count,
  onChange,
  onMove,
  onRemove,
  categories,
  errors,
  prefix,
}: {
  banner: HomeBanner;
  index: number;
  count: number;
  onChange: (banner: HomeBanner) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
  categories: Category[];
  errors: Errors;
  prefix: string;
}) {
  const at = (field: string) => errors[`${prefix}.${field}`];
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Banner {index + 1}</span>
        <div className="ml-auto flex gap-1">
          <Button type="button" variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => onMove(index - 1)} aria-label="Move banner up">
            <ArrowUp />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" disabled={index === count - 1} onClick={() => onMove(index + 1)} aria-label="Move banner down">
            <ArrowDown />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" disabled={count === 1} onClick={onRemove} aria-label="Remove banner">
            <Trash2 />
          </Button>
        </div>
      </div>
      <ImageField
        id={`banner-image-${banner.id}`}
        label="Image"
        shape="wide"
        value={banner.imageUrl}
        onChange={(imageUrl) => onChange({ ...banner, imageUrl: imageUrl.trim() })}
        error={at("imageUrl")}
        description="Wide image, about 2:1 (e.g. 1200×600)."
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput label="Title (optional)" maxLength={60} value={banner.title ?? ""} onChange={(title) => onChange({ ...banner, title: title || null })} error={at("title")} />
        <TextInput label="Subtitle (optional)" maxLength={100} value={banner.subtitle ?? ""} onChange={(subtitle) => onChange({ ...banner, subtitle: subtitle || null })} error={at("subtitle")} />
      </div>
      <LinkSelect link={banner.link} onChange={(link) => onChange({ ...banner, link })} categories={categories} error={at("link.categoryId")} />
    </div>
  );
}

function SectionFields({
  section,
  onChange,
  categories,
  brands,
  errors,
  prefix,
}: {
  section: HomeSection;
  onChange: (section: HomeSection) => void;
  categories: Category[];
  brands: Brand[];
  errors: Errors;
  prefix: string;
}) {
  const at = (field: string) => errors[`${prefix}.${field}`];
  const description =
    "description" in section ? (
      <DescriptionInput value={section.description} onChange={(next) => onChange({ ...section, description: next })} error={at("description")} />
    ) : null;

  switch (section.type) {
    case "banner_carousel":
      return (
        <FieldGroup>
          <Field orientation="horizontal">
            <Switch id={`${section.id}-autoplay`} checked={section.autoplay} onCheckedChange={(autoplay) => onChange({ ...section, autoplay })} />
            <FieldLabel htmlFor={`${section.id}-autoplay`}>Slide automatically</FieldLabel>
          </Field>
          {section.banners.map((banner, index) => (
            <BannerFields
              key={banner.id}
              banner={banner}
              index={index}
              count={section.banners.length}
              categories={categories}
              errors={errors}
              prefix={`${prefix}.banners.${index}`}
              onChange={(next) => onChange({ ...section, banners: section.banners.map((item, position) => (position === index ? next : item)) })}
              onMove={(to) => onChange({ ...section, banners: move(section.banners, index, to) })}
              onRemove={() => onChange({ ...section, banners: section.banners.filter((_, position) => position !== index) })}
            />
          ))}
          {at("banners") && <FieldError>{at("banners")}</FieldError>}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            disabled={section.banners.length >= MAX_BANNERS}
            onClick={() => onChange({ ...section, banners: [...section.banners, { id: newId(), imageUrl: "", title: null, subtitle: null, link: { type: "none" } }] })}
          >
            <Plus />
            Add banner
          </Button>
        </FieldGroup>
      );

    case "category_grid":
      return (
        <FieldGroup>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <TextInput label="Title (optional)" maxLength={40} value={section.title ?? ""} onChange={(title) => onChange({ ...section, title: title || null })} error={at("title")} />
            <Field>
              <FieldLabel>Tiles per row</FieldLabel>
              <Select value={String(section.columns)} onValueChange={(columns) => onChange({ ...section, columns: Number(columns) as 3 | 4 })}>
                <SelectTrigger className="w-full sm:w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3</SelectItem>
                  <SelectItem value="4">4</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          {description}
          <OrderedPicker
            id={`${section.id}-all`}
            allLabel="Show every active category"
            description="Tick the categories to show, in the order you tick them."
            options={categories}
            selected={section.categoryIds}
            defaultSelection={8}
            onChange={(categoryIds) => onChange({ ...section, categoryIds })}
            error={at("categoryIds") ?? firstNestedError(errors, `${prefix}.categoryIds`)}
          />
        </FieldGroup>
      );

    case "product_rail":
      return (
        <FieldGroup>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="Title" maxLength={40} value={section.title} onChange={(title) => onChange({ ...section, title })} error={at("title")} />
            <CategorySelect label="Products from" value={section.categoryId} onChange={(categoryId) => onChange({ ...section, categoryId })} categories={categories} error={at("categoryId")} />
          </div>
          {description}
          <TextInput
            label="How many products"
            type="number"
            min={4}
            max={20}
            value={String(section.limit)}
            onChange={(limit) => onChange({ ...section, limit: Number.parseInt(limit, 10) || 0 })}
            error={at("limit")}
            description="Only products in stock at the customer's store are shown."
            className="w-28"
          />
        </FieldGroup>
      );

    case "offer_strip":
      return (
        <FieldGroup>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="Title" maxLength={60} value={section.title} onChange={(title) => onChange({ ...section, title })} error={at("title")} />
            <TextInput label="Subtitle (optional)" maxLength={100} value={section.subtitle ?? ""} onChange={(subtitle) => onChange({ ...section, subtitle: subtitle || null })} error={at("subtitle")} />
          </div>
          <ImageField
            id={`offer-image-${section.id}`}
            label="Image (optional)"
            value={section.imageUrl ?? ""}
            onChange={(imageUrl) => onChange({ ...section, imageUrl: imageUrl.trim() || null })}
            error={at("imageUrl")}
            description="A small square image shown on the right."
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <ColorField label="Background" value={section.backgroundColor} onChange={(backgroundColor) => onChange({ ...section, backgroundColor })} error={at("backgroundColor")} />
            <ColorField
              label="Text"
              value={section.textColor}
              onChange={(textColor) => onChange({ ...section, textColor })}
              error={at("textColor")}
              contrastWith={{ color: section.backgroundColor, label: "the background" }}
            />
          </div>
          <LinkSelect link={section.link} onChange={(link) => onChange({ ...section, link })} categories={categories} error={at("link.categoryId")} />
        </FieldGroup>
      );

    case "deals_rail":
      return (
        <FieldGroup>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="Title" maxLength={40} value={section.title} onChange={(title) => onChange({ ...section, title })} error={at("title")} />
            <Field data-invalid={Boolean(at("categoryId"))}>
              <FieldLabel>Deals from</FieldLabel>
              <Select
                value={section.categoryId ?? ALL_CATEGORIES}
                onValueChange={(value) => onChange({ ...section, categoryId: value === ALL_CATEGORIES ? null : value })}
              >
                <SelectTrigger className="w-full" aria-invalid={Boolean(at("categoryId"))}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CATEGORIES}>All categories</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                      {!category.isActive && " (hidden)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError>{at("categoryId")}</FieldError>
            </Field>
          </div>
          {description}
          <TextInput
            label="How many products"
            type="number"
            min={4}
            max={20}
            value={String(section.limit)}
            onChange={(limit) => onChange({ ...section, limit: Number.parseInt(limit, 10) || 0 })}
            error={at("limit")}
            description="The biggest discounts off MRP among products in stock at the customer's store."
            className="w-28"
          />
        </FieldGroup>
      );

    case "buy_again":
      return (
        <FieldGroup>
          <TextInput
            label="Title"
            maxLength={40}
            value={section.title}
            onChange={(title) => onChange({ ...section, title })}
            error={at("title")}
            description="Each signed-in customer sees products from their past orders that are in stock. Hidden for new customers."
          />
          {description}
        </FieldGroup>
      );

    case "brand_rail":
      return (
        <FieldGroup>
          <TextInput label="Title" maxLength={40} value={section.title} onChange={(title) => onChange({ ...section, title })} error={at("title")} />
          {description}
          <OrderedPicker
            id={`${section.id}-all`}
            allLabel="Show the brands with the most products in stock"
            description="Tick the brands to show, in the order you tick them. Brands with nothing in stock are skipped."
            options={brands}
            selected={section.brandIds}
            defaultSelection={8}
            onChange={(brandIds) => onChange({ ...section, brandIds })}
            error={at("brandIds") ?? firstNestedError(errors, `${prefix}.brandIds`)}
          />
          {brands.length === 0 && <FieldDescription>No brands yet. Add them on the Brands page.</FieldDescription>}
        </FieldGroup>
      );

    case "category_deals":
      return (
        <FieldGroup>
          <TextInput label="Title" maxLength={40} value={section.title} onChange={(title) => onChange({ ...section, title })} error={at("title")} />
          {description}
          <OrderedPicker
            id={`${section.id}-all`}
            allLabel="Use every main category"
            description="Tick the categories to show, in the order you tick them. Categories with no discount are skipped."
            options={categories}
            selected={section.categoryIds}
            defaultSelection={6}
            onChange={(categoryIds) => onChange({ ...section, categoryIds })}
            error={at("categoryIds") ?? firstNestedError(errors, `${prefix}.categoryIds`)}
          />
        </FieldGroup>
      );

    case "image_tiles":
      return (
        <FieldGroup>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <TextInput label="Title (optional)" maxLength={40} value={section.title ?? ""} onChange={(title) => onChange({ ...section, title: title || null })} error={at("title")} />
            <Field>
              <FieldLabel>Layout</FieldLabel>
              <Select value={section.layout} onValueChange={(layout) => onChange({ ...section, layout: layout as "grid" | "carousel" })}>
                <SelectTrigger className="w-full sm:w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="grid">Grid</SelectItem>
                  <SelectItem value="carousel">Carousel</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {section.layout === "grid" && (
              <Field>
                <FieldLabel>Tiles per row</FieldLabel>
                <Select value={String(section.columns)} onValueChange={(columns) => onChange({ ...section, columns: Number(columns) as 2 | 3 })}>
                  <SelectTrigger className="w-full sm:w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">2</SelectItem>
                    <SelectItem value="3">3</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            )}
          </div>
          {description}
          {section.layout === "carousel" && (
            <FieldDescription>One large tile in the middle with the next and previous ones peeking in at the sides. Each tile can show a button.</FieldDescription>
          )}
          {section.tiles.map((tile, index) => (
            <TileFields
              key={tile.id}
              tile={tile}
              index={index}
              count={section.tiles.length}
              carousel={section.layout === "carousel"}
              categories={categories}
              errors={errors}
              prefix={`${prefix}.tiles.${index}`}
              onChange={(next) => onChange({ ...section, tiles: section.tiles.map((item, position) => (position === index ? next : item)) })}
              onMove={(to) => onChange({ ...section, tiles: move(section.tiles, index, to) })}
              onRemove={() => onChange({ ...section, tiles: section.tiles.filter((_, position) => position !== index) })}
            />
          ))}
          {at("tiles") && <FieldError>{at("tiles")}</FieldError>}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            disabled={section.tiles.length >= MAX_TILES}
            onClick={() => onChange({ ...section, tiles: [...section.tiles, newTile()] })}
          >
            <Plus />
            Add tile
          </Button>
        </FieldGroup>
      );

    case "category_collection":
      return (
        <FieldGroup>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <TextInput label="Title (optional)" maxLength={40} value={section.title ?? ""} onChange={(title) => onChange({ ...section, title: title || null })} error={at("title")} />
            <Field>
              <FieldLabel>Tiles per row</FieldLabel>
              <Select value={String(section.columns)} onValueChange={(columns) => onChange({ ...section, columns: Number(columns) as 2 | 3 | 4 | 5 })}>
                <SelectTrigger className="w-full sm:w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2, 3, 4, 5].map((columns) => (
                    <SelectItem key={columns} value={String(columns)}>
                      {columns}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          {description}
          {section.items.map((item, index) => (
            <CollectionItemFields
              key={item.id}
              item={item}
              index={index}
              count={section.items.length}
              categories={categories}
              errors={errors}
              prefix={`${prefix}.items.${index}`}
              onChange={(next) => onChange({ ...section, items: section.items.map((current, position) => (position === index ? next : current)) })}
              onMove={(to) => onChange({ ...section, items: move(section.items, index, to) })}
              onRemove={() => onChange({ ...section, items: section.items.filter((_, position) => position !== index) })}
            />
          ))}
          {at("items") && <FieldError>{at("items")}</FieldError>}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            disabled={section.items.length >= MAX_COLLECTION_ITEMS}
            onClick={() => onChange({ ...section, items: [...section.items, newCollectionItem()] })}
          >
            <Plus />
            Add category
          </Button>
        </FieldGroup>
      );

    case "subcategory_grid": {
      const parents = categories.filter((category) => !category.parentId);
      const parent = categories.find((category) => category.id === section.categoryId);
      return (
        <FieldGroup>
          <div className="grid gap-3 sm:grid-cols-2">
            <CategorySelect
              label="Show the sub-categories of"
              value={section.categoryId}
              onChange={(categoryId) => onChange({ ...section, categoryId })}
              categories={parents}
              error={at("categoryId")}
            />
            <TextInput
              label="Title (optional)"
              maxLength={40}
              placeholder={parent?.name ?? "Category name"}
              value={section.title ?? ""}
              onChange={(title) => onChange({ ...section, title: title || null })}
              error={at("title")}
            />
          </div>
          {description}
          {parent && parent.childCount === 0 && (
            <FieldDescription>{parent.name} has no sub-categories yet, so this section stays hidden in the app.</FieldDescription>
          )}
          <div className="flex flex-wrap gap-3">
            <Field className="w-fit">
              <FieldLabel>Tiles per row</FieldLabel>
              <Select value={String(section.columns)} onValueChange={(columns) => onChange({ ...section, columns: Number(columns) as 3 | 4 })}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3</SelectItem>
                  <SelectItem value="4">4</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <TextInput
              label="Show at most"
              type="number"
              min={3}
              max={12}
              value={String(section.limit)}
              onChange={(limit) => onChange({ ...section, limit: Number.parseInt(limit, 10) || 0 })}
              error={at("limit")}
              className="w-28"
            />
          </div>
          <FieldDescription>Uses each sub-category&apos;s image, in the order set on the Categories page. &quot;See all&quot; opens {parent?.name ?? "the category"}.</FieldDescription>
        </FieldGroup>
      );
    }
  }
}

const EDGE_LABELS: Record<SectionEdge, string> = { straight: "Straight", zigzag: "Paper cut (zigzag)", wave: "Wave" };

function BackgroundFields({
  section,
  onChange,
  colors,
  errors,
  prefix,
}: {
  section: HomeSection;
  onChange: (section: HomeSection) => void;
  colors: Appearance["theme"]["colors"];
  errors: Errors;
  prefix: string;
}) {
  const background = section.background;
  const at = (field: string) => errors[`${prefix}.background.${field}`];
  const set = (next: SectionBackground | null) => onChange({ ...section, background: next });

  return (
    <FieldGroup className="mt-5 border-t pt-5">
      <Field orientation="horizontal">
        <Switch
          id={`${section.id}-background`}
          checked={background !== null}
          onCheckedChange={(on) => set(on ? { color: colors.primary, textColor: colors.onPrimary, edge: "zigzag" } : null)}
        />
        <FieldLabel htmlFor={`${section.id}-background`}>Coloured background</FieldLabel>
      </Field>
      {background ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <ColorField label="Background" value={background.color} onChange={(color) => set({ ...background, color })} error={at("color")} />
            <ColorField
              label="Title and labels"
              value={background.textColor}
              onChange={(textColor) => set({ ...background, textColor })}
              error={at("textColor")}
              contrastWith={{ color: background.color, label: "the background" }}
            />
            <Field data-invalid={Boolean(at("edge"))}>
              <FieldLabel htmlFor={`${section.id}-edge`}>Bottom edge</FieldLabel>
              <Select value={background.edge} onValueChange={(edge) => set({ ...background, edge: edge as SectionEdge })}>
                <SelectTrigger id={`${section.id}-edge`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(EDGE_LABELS) as SectionEdge[]).map((edge) => (
                    <SelectItem key={edge} value={edge}>
                      {EDGE_LABELS[edge]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError>{at("edge")}</FieldError>
            </Field>
          </div>
          <FieldDescription>Product cards stay white. Give the next section the same colour to continue the band, or a different one for the edge to cut into.</FieldDescription>
        </>
      ) : (
        <FieldDescription>Put this section on a band of colour, e.g. for a sale or festival zone.</FieldDescription>
      )}
    </FieldGroup>
  );
}

function sectionSummary(section: HomeSection, categories: Category[]) {
  const categoryName = (id: string) => categories.find((category) => category.id === id)?.name ?? "No category";
  const count = (ids: string[], [one, many]: [string, string], all: string) => (ids.length ? `${ids.length} ${ids.length === 1 ? one : many}` : all);
  switch (section.type) {
    case "banner_carousel":
      return `${section.banners.length} banner${section.banners.length === 1 ? "" : "s"}`;
    case "category_grid":
      return section.title ?? (section.categoryIds.length ? `${section.categoryIds.length} categories` : "All categories");
    case "product_rail":
      return `${section.title} · ${categoryName(section.categoryId)}`;
    case "offer_strip":
    case "buy_again":
      return section.title;
    case "deals_rail":
      return `${section.title} · ${section.categoryId ? categoryName(section.categoryId) : "All categories"}`;
    case "brand_rail":
      return `${section.title} · ${count(section.brandIds, ["brand", "brands"], "Top brands")}`;
    case "category_deals":
      return `${section.title} · ${count(section.categoryIds, ["category", "categories"], "Main categories")}`;
    case "image_tiles":
      return `${section.title ?? `${section.tiles.length} tiles`} · ${section.layout === "carousel" ? "Carousel" : "Grid"}`;
    case "subcategory_grid":
      return section.title ?? categoryName(section.categoryId);
    case "category_collection":
      return `${section.title ?? count(section.items.map((item) => item.id), ["category", "categories"], "")} · ${section.columns} per row`;
  }
}

type HomeEditorProps = {
  value: Appearance;
  onChange: (next: Appearance) => void;
  categories: Category[];
  brands: Brand[];
  errors: Errors;
  expanded: string | null;
  onExpand: (id: string | null) => void;
};

export function HomeEditor({ value, onChange, categories, brands, errors, expanded, onExpand }: HomeEditorProps) {
  const sections = value.homeSections;
  const setSections = (homeSections: HomeSection[]) => onChange({ ...value, homeSections });

  function addSection(type: HomeSectionType) {
    const section = newSection(type, categories, value.theme.colors);
    setSections([...sections, section]);
    onExpand(section.id);
  }

  return (
    <div className="flex flex-col gap-3">
      <CategoryTabsEditor value={value} onChange={onChange} categories={categories} errors={errors} expanded={expanded} onExpand={onExpand} />
      <p className="mt-2 text-sm font-medium">Sections</p>
      {sections.length === 0 && (
        <Card>
          <CardContent>
            <p className="py-6 text-center text-sm text-muted-foreground">The home screen is empty. Add a section to get started.</p>
          </CardContent>
        </Card>
      )}

      {sections.map((section, index) => {
        const Icon = SECTION_ICONS[section.type];
        const prefix = `homeSections.${index}`;
        const hasErrors = Object.keys(errors).some((key) => key === prefix || key.startsWith(`${prefix}.`));
        const open = expanded === section.id || hasErrors;

        return (
          <Card key={section.id} size="sm" className={section.enabled ? undefined : "opacity-70"}>
            <CardHeader>
              <button type="button" onClick={() => onExpand(open ? null : section.id)} className="flex min-w-0 items-center gap-3 text-left" aria-expanded={open}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <CardTitle className="flex items-center gap-2">
                    {SECTION_LABELS[section.type].name}
                    {!section.enabled && <Badge variant="outline">Hidden</Badge>}
                    {hasErrors && <Badge variant="destructive">Needs attention</Badge>}
                  </CardTitle>
                  <CardDescription className="truncate">{sectionSummary(section, categories)}</CardDescription>
                </span>
                <ChevronDown className={`ml-1 size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
              </button>
              <CardAction className="flex items-center gap-1">
                <Switch
                  checked={section.enabled}
                  onCheckedChange={(enabled) => setSections(sections.map((item) => (item.id === section.id ? { ...item, enabled } : item)))}
                  aria-label={section.enabled ? "Hide section" : "Show section"}
                />
                <Button type="button" variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => setSections(move(sections, index, index - 1))} aria-label="Move section up">
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={index === sections.length - 1}
                  onClick={() => setSections(move(sections, index, index + 1))}
                  aria-label="Move section down"
                >
                  <ArrowDown />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => setSections(sections.filter((item) => item.id !== section.id))} aria-label="Remove section">
                  <Trash2 />
                </Button>
              </CardAction>
            </CardHeader>
            {open && (
              <CardContent>
                <SectionFields
                  section={section}
                  categories={categories}
                  brands={brands}
                  errors={errors}
                  prefix={prefix}
                  onChange={(next) => setSections(sections.map((item) => (item.id === section.id ? next : item)))}
                />
                <BackgroundFields
                  section={section}
                  colors={value.theme.colors}
                  errors={errors}
                  prefix={prefix}
                  onChange={(next) => setSections(sections.map((item) => (item.id === section.id ? next : item)))}
                />
              </CardContent>
            )}
          </Card>
        );
      })}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" className="self-start" disabled={sections.length >= MAX_SECTIONS}>
            <Plus />
            Add section
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          {(Object.keys(SECTION_LABELS) as HomeSectionType[]).map((type) => {
            const Icon = SECTION_ICONS[type];
            return (
              <DropdownMenuItem key={type} onSelect={() => addSection(type)} className="items-start">
                <Icon className="mt-0.5" />
                <span className="flex flex-col">
                  <span>{SECTION_LABELS[type].name}</span>
                  <span className="text-xs text-muted-foreground">{SECTION_LABELS[type].description}</span>
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
