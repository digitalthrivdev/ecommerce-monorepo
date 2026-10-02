"use client";

import { ArrowDown, ArrowUp, ChevronDown, GalleryHorizontal, LayoutGrid, Megaphone, Plus, Rows3, Trash2, type LucideIcon } from "lucide-react";

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
import { newId, newSection, SECTION_LABELS } from "@/lib/appearance";
import type { Appearance, AppearanceLink, Category, HomeBanner, HomeSection, HomeSectionType } from "@/lib/types";

const SECTION_ICONS: Record<HomeSectionType, LucideIcon> = {
  banner_carousel: GalleryHorizontal,
  category_grid: LayoutGrid,
  product_rail: Rows3,
  offer_strip: Megaphone,
};

const MAX_SECTIONS = 20;
const MAX_BANNERS = 10;

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

function SectionFields({ section, onChange, categories, errors, prefix }: { section: HomeSection; onChange: (section: HomeSection) => void; categories: Category[]; errors: Errors; prefix: string }) {
  const at = (field: string) => errors[`${prefix}.${field}`];

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

    case "category_grid": {
      const chooseAll = section.categoryIds.length === 0;
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
          <Field orientation="horizontal">
            <Switch
              id={`${section.id}-all`}
              checked={chooseAll}
              onCheckedChange={(all) =>
                onChange({ ...section, categoryIds: all ? [] : categories.filter((category) => category.isActive).slice(0, 8).map((category) => category.id) })
              }
            />
            <FieldLabel htmlFor={`${section.id}-all`}>Show every active category</FieldLabel>
          </Field>
          {!chooseAll && (
            <Field data-invalid={Boolean(at("categoryIds"))}>
              <FieldDescription>Tick the categories to show, in the order you tick them.</FieldDescription>
              <div className="grid gap-1 sm:grid-cols-2">
                {categories.map((category) => {
                  const position = section.categoryIds.indexOf(category.id);
                  const checked = position >= 0;
                  return (
                    <label key={category.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
                      <input
                        type="checkbox"
                        className="accent-primary"
                        checked={checked}
                        onChange={() =>
                          onChange({
                            ...section,
                            categoryIds: checked ? section.categoryIds.filter((id) => id !== category.id) : [...section.categoryIds, category.id],
                          })
                        }
                      />
                      <span className="flex-1">
                        {category.name}
                        {!category.isActive && <span className="text-muted-foreground"> (hidden)</span>}
                      </span>
                      {checked && <Badge variant="secondary">{position + 1}</Badge>}
                    </label>
                  );
                })}
              </div>
              <FieldError>{at("categoryIds") ?? Object.entries(errors).find(([key]) => key.startsWith(`${prefix}.categoryIds.`))?.[1]}</FieldError>
            </Field>
          )}
        </FieldGroup>
      );
    }

    case "product_rail":
      return (
        <FieldGroup>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="Title" maxLength={40} value={section.title} onChange={(title) => onChange({ ...section, title })} error={at("title")} />
            <CategorySelect label="Products from" value={section.categoryId} onChange={(categoryId) => onChange({ ...section, categoryId })} categories={categories} error={at("categoryId")} />
          </div>
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
  }
}

function sectionSummary(section: HomeSection, categories: Category[]) {
  const categoryName = (id: string) => categories.find((category) => category.id === id)?.name ?? "No category";
  switch (section.type) {
    case "banner_carousel":
      return `${section.banners.length} banner${section.banners.length === 1 ? "" : "s"}`;
    case "category_grid":
      return section.title ?? (section.categoryIds.length ? `${section.categoryIds.length} categories` : "All categories");
    case "product_rail":
      return `${section.title} · ${categoryName(section.categoryId)}`;
    case "offer_strip":
      return section.title;
  }
}

type HomeEditorProps = {
  value: Appearance;
  onChange: (next: Appearance) => void;
  categories: Category[];
  errors: Errors;
  expanded: string | null;
  onExpand: (id: string | null) => void;
};

export function HomeEditor({ value, onChange, categories, errors, expanded, onExpand }: HomeEditorProps) {
  const sections = value.homeSections;
  const setSections = (homeSections: HomeSection[]) => onChange({ ...value, homeSections });

  function addSection(type: HomeSectionType) {
    const section = newSection(type, categories, value.theme.colors);
    setSections([...sections, section]);
    onExpand(section.id);
  }

  return (
    <div className="flex flex-col gap-3">
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
