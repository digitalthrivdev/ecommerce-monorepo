"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Store } from "@/lib/types";

const ALL = "all";

/** Without `allowAll`, `value` is the store currently shown and one store is always selected. */
export function StoreFilter({ stores, allowAll = true, value }: { stores: Store[]; allowAll?: boolean; value?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function onChange(next: string) {
    const params = new URLSearchParams(searchParams);
    params.delete("page");
    if (next === ALL) {
      params.delete("storeId");
    } else {
      params.set("storeId", next);
    }
    const query = params.toString();
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname));
  }

  return (
    <Select value={value ?? searchParams.get("storeId") ?? ALL} onValueChange={onChange} disabled={pending}>
      <SelectTrigger className="w-52" aria-label="Filter by store">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allowAll && <SelectItem value={ALL}>All stores</SelectItem>}
        {stores.map((store) => (
          <SelectItem key={store.id} value={store.id}>
            {store.name}
            {store.status === "INACTIVE" && " (inactive)"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
