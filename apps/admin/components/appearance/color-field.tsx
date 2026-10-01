"use client";

import { useId } from "react";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { contrastRatio, isHexColor } from "@/lib/appearance";

type ColorFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  /** Warns when text in `value` would be hard to read on this background (or the reverse). */
  contrastWith?: { color: string; label: string };
};

export function ColorField({ label, value, onChange, error, contrastWith }: ColorFieldProps) {
  const id = useId();
  const ratio = contrastWith ? contrastRatio(value, contrastWith.color) : null;
  const lowContrast = ratio !== null && ratio < 4.5;

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={isHexColor(value) ? value : "#000000"}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
        />
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value.trim().toUpperCase())}
          maxLength={7}
          className="font-mono uppercase"
          aria-invalid={Boolean(error)}
        />
      </div>
      {lowContrast ? (
        <FieldDescription className="text-amber-600 dark:text-amber-400">
          Low contrast with {contrastWith!.label} ({ratio!.toFixed(1)}:1). Aim for at least 4.5:1 so text stays readable.
        </FieldDescription>
      ) : null}
      <FieldError>{error}</FieldError>
    </Field>
  );
}
