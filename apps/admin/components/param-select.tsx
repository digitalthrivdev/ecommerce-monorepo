"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ALL = "all";

/** A filter kept in the page URL as `?<param>=<value>`; changing it goes back to page 1. */
export function ParamSelect({
  param,
  options,
  allLabel,
  label,
  className,
}: {
  param: string;
  options: { value: string; label: string }[];
  allLabel: string;
  label: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const current = searchParams.get(param);
  const value = current && options.some((option) => option.value === current) ? current : ALL;

  function onChange(next: string) {
    const params = new URLSearchParams(searchParams);
    params.delete("page");
    if (next === ALL) params.delete(param);
    else params.set(param, next);
    const query = params.toString();
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname));
  }

  return (
    <Select value={value} onValueChange={onChange} disabled={pending}>
      <SelectTrigger className={cn("w-44", value !== ALL && "border-primary bg-primary-soft text-primary-ink", className)} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
