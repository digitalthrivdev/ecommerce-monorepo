"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { saveVariants } from "@/app/(dashboard)/products/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ProductDetail } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  addMissingCombinations,
  addOption,
  addOptionValue,
  draftFromProduct,
  MAX_OPTION_VALUES,
  MAX_OPTIONS,
  missingCombinations,
  removeOption,
  removeOptionValue,
  removeVariant,
  toPayload,
  variantLabel,
  type Draft,
  type OptionDraft,
  type VariantDraft,
} from "@/lib/variant-drafts";

const FIELD_LABELS: Record<string, string> = {
  sku: "SKU",
  quantity: "pack size",
  unit: "unit",
  barcode: "barcode",
  maxOrderQuantity: "max per order",
  optionValues: "options",
};

/** "Variant 3, SKU: " for "variants.2.sku". */
function errorLabel(path: string, options: OptionDraft[]) {
  const [list, index, field] = path.split(".");
  if (list === "variants" && index !== undefined) {
    return `Variant ${Number(index) + 1}${field ? `, ${FIELD_LABELS[field] ?? field}` : ""}: `;
  }
  if (list === "options" && index !== undefined) {
    return `${options[Number(index)]?.name || `Option ${Number(index) + 1}`}: `;
  }
  return "";
}

function ValueInput({ disabled, onAdd }: { disabled: boolean; onAdd: (value: string) => boolean }) {
  const [value, setValue] = useState("");
  const add = () => {
    if (value.trim() && onAdd(value.trim())) setValue("");
  };
  return (
    <Input
      value={value}
      disabled={disabled}
      maxLength={50}
      placeholder={disabled ? "Value limit reached" : "Add a value and press Enter"}
      className="w-56"
      onChange={(event) => setValue(event.target.value.replace(",", ""))}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === ",") {
          event.preventDefault();
          add();
        }
      }}
      onBlur={add}
    />
  );
}

function AddOptionForm({ onAdd, onCancel }: { onAdd: (name: string, value: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const ready = Boolean(name.trim() && value.trim());
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed p-3">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Option name
        <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={50} placeholder="e.g. Size, Flavour" className="w-44" autoFocus />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        First value
        <Input value={value} onChange={(event) => setValue(event.target.value)} maxLength={50} placeholder="e.g. 500 g" className="w-44" />
      </label>
      <Button type="button" size="sm" disabled={!ready} onClick={() => onAdd(name.trim(), value.trim())}>
        Add option
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      <p className="w-full text-xs text-muted-foreground">Existing variants get the first value. Add more values afterwards.</p>
    </div>
  );
}

/**
 * Options (e.g. Size × Flavour) and the variants made from them. Saving replaces the full set;
 * variants that were removed are deleted with their store listings and stock, which the API
 * refuses for variants that have been ordered (deactivate those instead).
 */
export function VariantsEditor({ product }: { product: ProductDetail }) {
  const initial = useMemo(() => draftFromProduct(product), [product]);
  const [draft, setDraft] = useState(initial);
  const [addingOption, setAddingOption] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const { options, variants } = draft;
  const payload = toPayload(draft);
  const dirty = JSON.stringify(payload) !== JSON.stringify(toPayload(initial));
  const missing = missingCombinations(draft).length;

  /** Applies a structural change; row indexes shift, so old field errors are cleared. */
  function apply(result: Draft | string) {
    if (typeof result === "string") {
      toast.error(result);
      return false;
    }
    setDraft(result);
    setErrors({});
    return true;
  }

  function renameOption(optionKey: string, name: string) {
    setDraft({ ...draft, options: options.map((option) => (option.key === optionKey ? { ...option, name } : option)) });
  }

  function updateVariant(key: string, changes: Partial<VariantDraft>) {
    setDraft({ ...draft, variants: variants.map((variant) => (variant.key === key ? { ...variant, ...changes } : variant)) });
  }

  function save() {
    startTransition(async () => {
      const result = await saveVariants(product.id, payload);
      if (result.ok) {
        toast.success(result.message);
      } else {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
      }
    });
  }

  function reset() {
    setDraft(initial);
    setErrors({});
    setAddingOption(false);
  }

  const cellError = (index: number, field: string) => errors[`variants.${index}.${field}`];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {options.map((option, index) => (
          <div key={option.key} className="flex flex-col gap-2 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <Input
                value={option.name}
                onChange={(event) => renameOption(option.key, event.target.value)}
                maxLength={50}
                aria-label="Option name"
                aria-invalid={Boolean(errors[`options.${index}.name`])}
                className="w-44 font-medium"
              />
              <span className="text-xs text-muted-foreground">{option.values.length} values</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="ml-auto size-8"
                aria-label={`Remove ${option.name}`}
                onClick={() => apply(removeOption(draft, option.key))}
              >
                <Trash2 />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {option.values.map((value) => (
                <Badge key={value} variant="secondary" className="gap-1 pr-1">
                  {value}
                  {option.values.length > 1 && (
                    <button
                      type="button"
                      className="rounded-sm opacity-60 hover:opacity-100"
                      aria-label={`Remove ${value}`}
                      onClick={() => apply(removeOptionValue(draft, option.key, value))}
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </Badge>
              ))}
              <ValueInput
                disabled={option.values.length >= MAX_OPTION_VALUES}
                onAdd={(value) => apply(addOptionValue(draft, option.key, value, product.slug))}
              />
            </div>
          </div>
        ))}

        {addingOption ? (
          <AddOptionForm
            onAdd={(name, value) => {
              if (apply(addOption(draft, name, value))) setAddingOption(false);
            }}
            onCancel={() => setAddingOption(false)}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={options.length >= MAX_OPTIONS} onClick={() => setAddingOption(true)}>
              <Plus />
              {options.length === 0 ? "Add options like size or flavour" : "Add option"}
            </Button>
            {missing > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => apply(addMissingCombinations(draft, product.slug))}>
                Add {missing} missing {missing === 1 ? "combination" : "combinations"}
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Variant</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Pack size</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Barcode</TableHead>
              <TableHead>Max / order</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="w-0">
                <span className="sr-only">Remove</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {variants.map((variant, index) => {
              const label = variantLabel(options, variant) || "Default";
              const field = (name: "sku" | "quantity" | "unit" | "barcode" | "maxOrderQuantity", props: React.ComponentProps<typeof Input>) => (
                <Input
                  {...props}
                  value={variant[name]}
                  onChange={(event) => updateVariant(variant.key, { [name]: event.target.value })}
                  aria-invalid={Boolean(cellError(index, name))}
                  title={cellError(index, name)}
                />
              );
              return (
                <TableRow key={variant.key} className={cn(!variant.isActive && "text-muted-foreground")}>
                  <TableCell className="whitespace-normal">
                    <span className="font-medium">{label}</span>
                    {!variant.id && <span className="ml-2 text-xs text-muted-foreground">new</span>}
                  </TableCell>
                  <TableCell>{field("sku", { "aria-label": `${label} SKU`, maxLength: 64, className: "w-48 uppercase" })}</TableCell>
                  <TableCell>{field("quantity", { "aria-label": `${label} pack size`, inputMode: "decimal", placeholder: "500", className: "w-20" })}</TableCell>
                  <TableCell>{field("unit", { "aria-label": `${label} unit`, maxLength: 20, placeholder: "g", className: "w-16" })}</TableCell>
                  <TableCell>{field("barcode", { "aria-label": `${label} barcode`, maxLength: 32, className: "w-36" })}</TableCell>
                  <TableCell>
                    {field("maxOrderQuantity", { "aria-label": `${label} max per order`, inputMode: "numeric", placeholder: "—", className: "w-16" })}
                  </TableCell>
                  <TableCell>
                    <Switch checked={variant.isActive} onCheckedChange={(isActive) => updateVariant(variant.key, { isActive })} aria-label={`${label} active`} />
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      disabled={variants.length === 1}
                      aria-label={`Remove ${label}`}
                      onClick={() => apply(removeVariant(draft, variant.key))}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {Object.keys(errors).length > 0 && (
        <ul className="list-disc pl-5 text-sm text-destructive">
          {Object.entries(errors).map(([path, message]) => (
            <li key={path}>
              {errorLabel(path, options)}
              {message}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={pending || !dirty} onClick={save}>
          {pending && <Loader2 className="animate-spin" />}
          Save variants
        </Button>
        {dirty && (
          <Button type="button" variant="ghost" disabled={pending} onClick={reset}>
            Discard changes
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          Removing a variant deletes its store prices and stock. Variants that have been ordered can only be deactivated.
          Max / order is capped at 50.
        </p>
      </div>
    </div>
  );
}
