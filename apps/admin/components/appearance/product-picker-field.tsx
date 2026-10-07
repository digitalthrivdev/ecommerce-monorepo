"use client";

import { useEffect, useId, useRef, useState } from "react";

import { searchAppearanceProducts } from "@/app/(dashboard)/appearance/actions";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { AppearanceProduct } from "@/lib/types";
import { cn } from "@/lib/utils";

const SEARCH_DELAY_MS = 250;

type ProductPickerFieldProps = {
  label: string;
  value: string;
  known: AppearanceProduct[];
  onPick: (product: AppearanceProduct) => void;
  error?: string;
  /** Already chosen elsewhere in the list, so they aren't offered twice. */
  excludeIds?: string[];
};

/** A search box that turns into the chosen product; "Change" searches again. */
export function ProductPickerField({ label, value, known, onPick, error, excludeIds = [] }: ProductPickerFieldProps) {
  const id = useId();
  const selected = known.find((product) => product.id === value) ?? null;
  const [editing, setEditing] = useState(!value);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AppearanceProduct[]>([]);
  const [pending, setPending] = useState(false);
  const request = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function search(next: string) {
    setQuery(next);
    clearTimeout(timer.current);
    const term = next.trim();
    const current = ++request.current;
    if (term.length < 2) {
      setResults([]);
      setPending(false);
      return;
    }
    setPending(true);
    timer.current = setTimeout(() => {
      void searchAppearanceProducts(term).then((items) => {
        if (current !== request.current) return;
        setResults(items);
        setPending(false);
      });
    }, SEARCH_DELAY_MS);
  }

  function pick(product: AppearanceProduct) {
    onPick(product);
    setEditing(false);
    search("");
  }

  if (!editing && selected) {
    return (
      <Field data-invalid={Boolean(error)}>
        <FieldLabel>{label}</FieldLabel>
        <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          {selected.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- product images can be on any host
            <img src={selected.imageUrl} alt="" className="size-8 shrink-0 rounded object-contain" />
          )}
          <span className="min-w-0 flex-1 truncate font-medium">
            {selected.name}
            {!selected.isActive && <span className="text-muted-foreground"> (hidden)</span>}
          </span>
          <button type="button" className="shrink-0 text-xs font-semibold text-primary hover:underline" onClick={() => setEditing(true)}>
            Change
          </button>
        </div>
        <FieldError>{error}</FieldError>
      </Field>
    );
  }

  const offered = results.filter((product) => product.id === value || !excludeIds.includes(product.id));

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        value={query}
        onChange={(event) => search(event.target.value)}
        placeholder="Search by product name"
        aria-invalid={Boolean(error)}
        autoComplete="off"
        autoFocus={!value}
      />
      {query.trim().length >= 2 && (
        <ul className="max-h-56 overflow-y-auto rounded-md border bg-popover text-sm shadow-sm">
          {pending && <li className="px-3 py-2 text-muted-foreground">Searching…</li>}
          {!pending && offered.length === 0 && <li className="px-3 py-2 text-muted-foreground">No products match.</li>}
          {!pending &&
            offered.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  className={cn("flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted", product.id === value && "bg-primary/10")}
                  onClick={() => pick(product)}
                >
                  {product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- product images can be on any host
                    <img src={product.imageUrl} alt="" className="size-7 shrink-0 rounded object-contain" />
                  ) : (
                    <span className="size-7 shrink-0 rounded bg-muted" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{product.name}</span>
                  {!product.isActive && <span className="text-xs text-muted-foreground">hidden</span>}
                </button>
              </li>
            ))}
        </ul>
      )}
      {value && !selected && <p className="text-xs text-destructive">This product no longer exists. Choose another or remove it.</p>}
      {selected && (
        <button type="button" className="self-start text-xs font-semibold text-muted-foreground hover:underline" onClick={() => setEditing(false)}>
          Keep {selected.name}
        </button>
      )}
      <FieldError>{error}</FieldError>
    </Field>
  );
}
