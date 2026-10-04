"use client";

import { ArrowDown, ArrowUp, ChevronDown, PanelsTopLeft, Plus, ShoppingBasket, Trash2 } from "lucide-react";
import { useState } from "react";

import { ColorField } from "@/components/appearance/color-field";
import { ImageField } from "@/components/image-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { newId, newTabPage } from "@/lib/appearance";
import { TAB_ICONS } from "@/lib/tab-icons";
import type { Appearance, Category, CategoryTab, CategoryTabIcon, TabHeader } from "@/lib/types";
import { cn } from "@/lib/utils";

const MAX_TABS = 12;

type Errors = Record<string, string>;

const ICON_SOURCES: { type: CategoryTabIcon["type"]; label: string }[] = [
  { type: "category", label: "Category image" },
  { type: "preset", label: "Icon" },
  { type: "image", label: "Custom image" },
];

type Colors = Appearance["theme"]["colors"];

function Segmented<T extends string>({ label, options, value, onChange }: { label: string; options: { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return (
    <div className="flex w-fit rounded-md border p-0.5" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn("rounded px-3 py-1 text-sm", value === option.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function TabHeaderFields({ tabId, header, onChange, errors, prefix }: { tabId: string; header: TabHeader; onChange: (header: TabHeader) => void; errors: Errors; prefix: string }) {
  const at = (field: string) => errors[`${prefix}.${field}`];
  const gradient = header.gradientColor !== null;
  return (
    <FieldGroup className="rounded-lg bg-muted/40 p-3">
      <Field>
        <FieldLabel>Header</FieldLabel>
        <FieldDescription>Recolours the whole header, from the status bar to the tabs, while this page is open.</FieldDescription>
        <Segmented
          label="Header background"
          options={[
            { value: "solid", label: "Solid colour" },
            { value: "gradient", label: "Gradient" },
          ]}
          value={gradient ? "gradient" : "solid"}
          onChange={(style) => onChange({ ...header, gradientColor: style === "gradient" ? (header.gradientColor ?? header.color) : null })}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <ColorField label={gradient ? "Top colour" : "Colour"} value={header.color} onChange={(color) => onChange({ ...header, color })} error={at("color")} />
        {gradient && (
          <ColorField
            label="Bottom colour"
            value={header.gradientColor ?? header.color}
            onChange={(gradientColor) => onChange({ ...header, gradientColor })}
            error={at("gradientColor")}
          />
        )}
        <ColorField
          label="Text and icons"
          value={header.textColor}
          onChange={(textColor) => onChange({ ...header, textColor })}
          error={at("textColor")}
          contrastWith={{ color: header.color, label: "the header" }}
        />
      </div>
      <ImageField
        id={`tab-header-image-${tabId}`}
        label="Header image (optional)"
        shape="wide"
        value={header.imageUrl ?? ""}
        onChange={(imageUrl) => onChange({ ...header, imageUrl: imageUrl.trim() || null })}
        error={at("imageUrl")}
        description="Covers the header behind the text; GIFs stay animated. About 3:2 (e.g. 1200×800). Keep the middle plain so the address stays readable."
      />
    </FieldGroup>
  );
}

function IconPicker({ value, onChange, error }: { value: string | null; onChange: (name: string) => void; error?: string }) {
  const [open, setOpen] = useState(false);
  const Current = value ? TAB_ICONS[value] : undefined;
  return (
    <Field data-invalid={Boolean(error)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="w-fit" aria-invalid={Boolean(error)}>
            {Current ? <Current /> : null}
            {Current ? "Change icon" : "Choose an icon"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80">
          <div className="grid max-h-72 grid-cols-8 gap-1 overflow-y-auto">
            {Object.entries(TAB_ICONS).map(([name, Icon]) => (
              <button
                key={name}
                type="button"
                title={name.replace(/-/g, " ")}
                aria-label={name.replace(/-/g, " ")}
                onClick={() => {
                  onChange(name);
                  setOpen(false);
                }}
                className={cn("flex size-8 items-center justify-center rounded-md hover:bg-muted", name === value && "bg-primary/10 text-primary ring-1 ring-primary")}
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <FieldError>{error}</FieldError>
    </Field>
  );
}

function TabFields({
  tab,
  index,
  count,
  categories,
  colors,
  onChange,
  onMove,
  onRemove,
  onEditPage,
  errors,
  prefix,
}: {
  tab: CategoryTab;
  index: number;
  count: number;
  categories: Category[];
  colors: Colors;
  onChange: (tab: CategoryTab) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
  onEditPage: () => void;
  errors: Errors;
  prefix: string;
}) {
  const at = (field: string) => errors[`${prefix}.${field}`];
  const category = categories.find((item) => item.id === tab.categoryId);

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Tab {index + 1}</span>
        <div className="ml-auto flex gap-1">
          <Button type="button" variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => onMove(index - 1)} aria-label="Move tab left">
            <ArrowUp />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" disabled={index === count - 1} onClick={() => onMove(index + 1)} aria-label="Move tab right">
            <ArrowDown />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label="Remove tab">
            <Trash2 />
          </Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[2fr_1.5fr_1fr]">
        <Field data-invalid={Boolean(at("categoryId"))}>
          <FieldLabel>Opens</FieldLabel>
          <Select value={tab.categoryId || undefined} onValueChange={(categoryId) => onChange({ ...tab, categoryId })}>
            <SelectTrigger className="w-full" aria-invalid={Boolean(at("categoryId"))}>
              <SelectValue placeholder="Choose a category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.parentId ? `— ${item.name}` : item.name}
                  {!item.isActive && " (hidden)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError>{at("categoryId")}</FieldError>
        </Field>
        <Field data-invalid={Boolean(at("label"))}>
          <FieldLabel>Label (optional)</FieldLabel>
          <Input
            maxLength={16}
            placeholder={category?.name ?? "Category name"}
            value={tab.label ?? ""}
            onChange={(event) => onChange({ ...tab, label: event.target.value || null })}
            aria-invalid={Boolean(at("label"))}
          />
          <FieldError>{at("label")}</FieldError>
        </Field>
        <Field data-invalid={Boolean(at("badge"))}>
          <FieldLabel>Badge (optional)</FieldLabel>
          <Input
            maxLength={8}
            placeholder="New"
            value={tab.badge ?? ""}
            onChange={(event) => onChange({ ...tab, badge: event.target.value || null })}
            aria-invalid={Boolean(at("badge"))}
          />
          <FieldError>{at("badge")}</FieldError>
        </Field>
      </div>
      <Field>
        <FieldLabel>Icon</FieldLabel>
        <div className="flex w-fit rounded-md border p-0.5" role="radiogroup" aria-label="Icon">
          {ICON_SOURCES.map((source) => (
            <button
              key={source.type}
              type="button"
              role="radio"
              aria-checked={tab.icon.type === source.type}
              onClick={() => {
                if (tab.icon.type === source.type) return;
                const icon: CategoryTabIcon =
                  source.type === "preset" ? { type: "preset", name: "" } : source.type === "image" ? { type: "image", url: "" } : { type: "category" };
                onChange({ ...tab, icon });
              }}
              className={cn(
                "rounded px-3 py-1 text-sm",
                tab.icon.type === source.type ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {source.label}
            </button>
          ))}
        </div>
        {tab.icon.type === "category" && (
          <FieldDescription>{category?.imageUrl ? "Uses the image set on the category." : "This category has no image, so its first letter is shown."}</FieldDescription>
        )}
      </Field>
      {tab.icon.type === "preset" && (
        <IconPicker value={tab.icon.name || null} onChange={(name) => onChange({ ...tab, icon: { type: "preset", name } })} error={at("icon.name")} />
      )}
      {tab.icon.type === "image" && (
        <ImageField
          id={`tab-icon-${tab.id}`}
          label="Icon image"
          value={tab.icon.url}
          onChange={(url) => onChange({ ...tab, icon: { type: "image", url: url.trim() } })}
          error={at("icon.url")}
          description="A small square image with a transparent background works best (e.g. 128×128 PNG)."
        />
      )}
      <Field>
        <FieldLabel>When tapped</FieldLabel>
        <Segmented
          label="When tapped"
          options={[
            { value: "category", label: "Open the category screen" },
            { value: "page", label: "Show its own page" },
          ]}
          value={tab.opens}
          onChange={(opens) => onChange({ ...tab, opens, page: tab.page ?? (opens === "page" ? newTabPage(colors) : null) })}
        />
        {tab.opens === "category" && <FieldDescription>Opens {category?.name ?? "the category"} with its sub-categories and products.</FieldDescription>}
      </Field>
      {tab.opens === "page" && tab.page && (
        <>
          <TabHeaderFields tabId={tab.id} header={tab.page.header} onChange={(header) => onChange({ ...tab, page: { ...tab.page!, header } })} errors={errors} prefix={`${prefix}.page.header`} />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onEditPage}>
              <PanelsTopLeft />
              Edit page sections
            </Button>
            <span className="text-xs text-muted-foreground">
              {tab.page.sections.length === 0 ? "No sections yet" : `${tab.page.sections.length} section${tab.page.sections.length === 1 ? "" : "s"}`}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function move<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

export const CATEGORY_TABS_ID = "categoryTabs";

type CategoryTabsEditorProps = {
  value: Appearance;
  onChange: (next: Appearance) => void;
  categories: Category[];
  errors: Errors;
  expanded: string | null;
  onExpand: (id: string | null) => void;
  onEditPage: (tabId: string) => void;
};

const newTab = (categoryId: string): CategoryTab => ({ id: newId(), categoryId, label: null, icon: { type: "category" }, badge: null, opens: "category", page: null });

/** Errors in a tab page's sections are shown in the section list, not here. */
const isTabError = (key: string) => key.startsWith(`${CATEGORY_TABS_ID}.`) && !key.includes(".page.sections");

function tabsSummary(enabled: boolean, tabs: CategoryTab[], categories: Category[]) {
  if (!enabled) return "Hidden. Turn on to show shortcuts under the search bar.";
  const names = tabs.map((tab) => tab.label ?? categories.find((category) => category.id === tab.categoryId)?.name ?? "No category");
  return `${tabs.length} tab${tabs.length === 1 ? "" : "s"}: All, ${names.join(", ")}`;
}

/** The row of category shortcuts under the search bar. */
export function CategoryTabsEditor({ value, onChange, categories, errors, expanded, onExpand, onEditPage }: CategoryTabsEditorProps) {
  const { enabled, tabs } = value.categoryTabs;
  const set = (categoryTabs: Appearance["categoryTabs"]) => onChange({ ...value, categoryTabs });
  const setTabs = (next: CategoryTab[]) => set({ enabled, tabs: next });
  const hasErrors = Object.keys(errors).some(isTabError);
  const open = enabled && (expanded === CATEGORY_TABS_ID || hasErrors);

  function addTab() {
    const used = new Set(tabs.map((tab) => tab.categoryId));
    const next = categories.find((category) => category.isActive && !category.parentId && !used.has(category.id));
    setTabs([...tabs, newTab(next?.id ?? "")]);
  }

  return (
    <Card size="sm">
      <CardHeader>
        <button
          type="button"
          onClick={() => onExpand(open ? null : CATEGORY_TABS_ID)}
          disabled={!enabled}
          className="flex min-w-0 items-center gap-3 text-left"
          aria-expanded={open}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
            <ShoppingBasket className="size-4" />
          </span>
          <span className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              Category tabs
              {hasErrors && <Badge variant="destructive">Needs attention</Badge>}
            </CardTitle>
            <CardDescription className="truncate">{tabsSummary(enabled, tabs, categories)}</CardDescription>
          </span>
          {enabled && <ChevronDown className={cn("ml-1 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />}
        </button>
        <CardAction>
          <Switch
            checked={enabled}
            onCheckedChange={(on) => {
              if (on && tabs.length === 0) {
                const firstFew = categories.filter((category) => category.isActive && !category.parentId).slice(0, 5);
                set({ enabled: true, tabs: firstFew.map((category) => newTab(category.id)) });
              } else set({ enabled: on, tabs });
              if (on) onExpand(CATEGORY_TABS_ID);
            }}
            aria-label={enabled ? "Hide category tabs" : "Show category tabs"}
          />
        </CardAction>
      </CardHeader>
      {open && (
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            Shortcuts under the search bar. The first tab, &quot;All&quot;, is the home screen. A tab can open its category, or show its own page with its own header colours and sections.
          </p>
          <FieldGroup>
            {tabs.map((tab, index) => (
              <TabFields
                key={tab.id}
                tab={tab}
                index={index}
                count={tabs.length}
                categories={categories}
                colors={value.theme.colors}
                errors={errors}
                prefix={`categoryTabs.tabs.${index}`}
                onChange={(next) => setTabs(tabs.map((item, position) => (position === index ? next : item)))}
                onMove={(to) => setTabs(move(tabs, index, to))}
                onRemove={() => setTabs(tabs.filter((_, position) => position !== index))}
                onEditPage={() => onEditPage(tab.id)}
              />
            ))}
            {errors["categoryTabs.tabs"] && <FieldError>{errors["categoryTabs.tabs"]}</FieldError>}
            <Button type="button" variant="outline" size="sm" className="self-start" disabled={tabs.length >= MAX_TABS} onClick={addTab}>
              <Plus />
              Add tab
            </Button>
          </FieldGroup>
        </CardContent>
      )}
    </Card>
  );
}
