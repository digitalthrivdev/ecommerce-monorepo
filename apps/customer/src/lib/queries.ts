import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";

import { apiFetch } from "./api";
import type { Category, HomeFeed, Paginated, StoreProduct } from "./types";

const PRODUCTS_PAGE_SIZE = 30;

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

/** A store's products, newest page last. Includes out-of-stock items so customers can see them. */
export function useStoreProducts(storeId: string | undefined, filter: { categoryId?: string; search?: string }, { enabled = true }: { enabled?: boolean } = {}) {
  return useInfiniteQuery({
    queryKey: ["store-products", storeId ?? null, filter.categoryId ?? null, filter.search ?? null],
    queryFn: ({ pageParam }) =>
      apiFetch<Paginated<StoreProduct>>(`/stores/${encodeURIComponent(storeId!)}/products`, {
        query: { limit: PRODUCTS_PAGE_SIZE, offset: pageParam, categoryId: filter.categoryId, search: filter.search },
      }),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.offset + last.items.length < last.total ? last.offset + last.items.length : undefined),
    enabled: Boolean(storeId) && enabled,
  });
}

/** The product as already shown in a list or rail, so details open without a blank screen. */
function cachedProduct(queryClient: QueryClient, storeId: string, productId: string) {
  for (const [, data] of queryClient.getQueriesData<InfiniteData<Paginated<StoreProduct>>>({ queryKey: ["store-products", storeId] })) {
    const found = data?.pages.flatMap((page) => page.items).find((product) => product.productId === productId);
    if (found) return found;
  }
  const feed = queryClient.getQueryData<HomeFeed>(["home", storeId]);
  return feed?.sections.flatMap((section) => (section.type === "product_rail" ? section.products : [])).find((product) => product.productId === productId);
}

export function useStoreProduct(storeId: string | undefined, productId: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ["store-product", storeId ?? null, productId],
    queryFn: () => apiFetch<StoreProduct>(`/stores/${encodeURIComponent(storeId!)}/products/${encodeURIComponent(productId)}`),
    placeholderData: () => (storeId ? cachedProduct(queryClient, storeId, productId) : undefined),
    enabled: Boolean(storeId),
  });
}
