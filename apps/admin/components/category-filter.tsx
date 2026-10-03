"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { categoryOptions } from "@/lib/categories";
import type { Category } from "@/lib/types";

const ALL = "all";

/** Picking a top-level category also shows its sub-categories' products. */
export function CategoryFilter({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function onChange(next: string) {
    const params = new URLSearchParams(searchParams);
    params.delete("page");
    if (next === ALL) {
      params.delete("categoryId");
    } else {
      params.set("categoryId", next);
    }
    const query = params.toString();
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname));
  }

  return (
    <Select value={searchParams.get("categoryId") ?? ALL} onValueChange={onChange} disabled={pending}>
      <SelectTrigger className="w-56" aria-label="Filter by category">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All categories</SelectItem>
        {categoryOptions(categories).map(({ category, depth }) => (
          <SelectItem key={category.id} value={category.id} className={depth ? "pl-6" : undefined}>
            {category.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
