import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "./api";
import type { Category, HomeFeed, Paginated } from "./types";

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetch<Paginated<Category>>("/categories", { query: { limit: 100 } }),
    staleTime: 10 * 60_000,
  });
}

/** Product rails are only included once a store is known. */
export function useHomeFeed(storeId: string | undefined, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["home", storeId ?? null],
    queryFn: () => apiFetch<HomeFeed>("/home", { query: { storeId } }),
    staleTime: 5 * 60_000,
    enabled,
  });
}
