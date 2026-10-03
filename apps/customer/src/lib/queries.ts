import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";

import { apiFetch } from "./api";
import { detailPlaceholder } from "./catalog";
import { buyAgainKey } from "./orders";
import type { Category, HomeFeed, Paginated, StoreBrand, StoreProduct, StoreProductDetail } from "./types";

const PRODUCTS_PAGE_SIZE = 30;

/** Every active category, top-level and sub-categories alike. */
export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetch<Paginated<Category>>("/categories", { query: { limit: 200 } }),
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

/**
 * A store's products, newest page last. Includes out-of-stock items so customers can see them.
 * A top-level category includes its sub-categories' products.
 */
export function useStoreProducts(
  storeId: string | undefined,
  filter: { categoryId?: string; brandId?: string; search?: string },
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useInfiniteQuery({
    queryKey: ["store-products", storeId ?? null, filter.categoryId ?? null, filter.search ?? null, filter.brandId ?? null],
    queryFn: ({ pageParam }) =>
      apiFetch<Paginated<StoreProduct>>(`/stores/${encodeURIComponent(storeId!)}/products`, {
        query: { limit: PRODUCTS_PAGE_SIZE, offset: pageParam, categoryId: filter.categoryId, brandId: filter.brandId, search: filter.search },
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
  const lists = [
    ...queryClient.getQueriesData<{ items: StoreProduct[] }>({ queryKey: ["store-product-list", storeId] }),
    ...queryClient.getQueriesData<{ items: StoreProduct[] }>({ queryKey: buyAgainKey(storeId) }),
  ];
  const listed = lists.flatMap(([, data]) => data?.items ?? []).find((product) => product.productId === productId);
  if (listed) return listed;
  const feed = queryClient.getQueryData<HomeFeed>(["home", storeId]);
  return feed?.sections
    .flatMap((section) => (section.type === "product_rail" || section.type === "deals_rail" ? section.products : []))
    .find((product) => product.productId === productId);
}

/** In-stock products often ordered together with the given ones, most frequent first. */
export function useAlsoBought(storeId: string | undefined, productIds: string[], { limit = 10 }: { limit?: number } = {}) {
  const ids = [...productIds].sort().slice(0, 30).join(",");
  return useQuery({
    queryKey: ["store-product-list", storeId ?? null, "also-bought", ids, limit],
    queryFn: () =>
      apiFetch<{ items: StoreProduct[] }>(`/stores/${encodeURIComponent(storeId!)}/products/also-bought`, { query: { productIds: ids, limit } }),
    staleTime: 10 * 60_000,
    placeholderData: keepPreviousData,
    enabled: Boolean(storeId) && ids.length > 0,
  });
}

/** Brands with something in stock at the store, most products first; optionally within one category. */
export function useStoreBrands(storeId: string | undefined, { categoryId, limit = 20 }: { categoryId?: string; limit?: number } = {}) {
  return useQuery({
    queryKey: ["store-brands", storeId ?? null, categoryId ?? null, limit],
    queryFn: () => apiFetch<{ items: StoreBrand[] }>(`/stores/${encodeURIComponent(storeId!)}/brands`, { query: { categoryId, limit } }),
    staleTime: 10 * 60_000,
    enabled: Boolean(storeId),
  });
}

export function useStoreProduct(storeId: string | undefined, productId: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ["store-product", storeId ?? null, productId],
    queryFn: () => apiFetch<StoreProductDetail>(`/stores/${encodeURIComponent(storeId!)}/products/${encodeURIComponent(productId)}`),
    placeholderData: () => {
      const cached = storeId ? cachedProduct(queryClient, storeId, productId) : undefined;
      return cached && detailPlaceholder(cached);
    },
    enabled: Boolean(storeId),
  });
}
