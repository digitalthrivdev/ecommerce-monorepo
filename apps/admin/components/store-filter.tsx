"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Store } from "@/lib/types";

const ALL = "all";

export function StoreFilter({ stores }: { stores: Store[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams);
    params.delete("page");
    if (value === ALL) {
      params.delete("storeId");
    } else {
      params.set("storeId", value);
    }
    const query = params.toString();
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname));
  }

  return (
    <Select value={searchParams.get("storeId") ?? ALL} onValueChange={onChange} disabled={pending}>
      <SelectTrigger className="w-52" aria-label="Filter by store">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All stores</SelectItem>
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
