import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";

import { apiFetch } from "./api";
import { detailPlaceholder } from "./catalog";
import { buyAgainKey } from "./orders";
import type { CatalogBrand, Category, HomeFeed, HomeTabPage, Paginated, Product, ProductDetail } from "./types";

const PRODUCTS_PAGE_SIZE = 30;

/** Every active category, top-level and sub-categories alike. */
export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetch<Paginated<Category>>("/categories", { query: { limit: 200 } }),
    staleTime: 10 * 60_000,
  });
}

export function useHomeFeed({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["home"],
    queryFn: () => apiFetch<HomeFeed>("/home"),
    staleTime: 5 * 60_000,
    enabled,
  });
}

/** A category tab's own page; fetched the first time it is opened, then cached like the home feed. */
export function useHomeTabPage(tabId: string | null, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["home", "tab", tabId],
    queryFn: () => apiFetch<HomeTabPage>("/home", { query: { tabId: tabId! } }),
    staleTime: 5 * 60_000,
    enabled: tabId !== null && enabled,
  });
}

/**
 * Catalog products, newest page last. Includes out-of-stock items so customers can see them.
 * A top-level category includes its sub-categories' products.
 */
export function useProducts(filter: { categoryId?: string; brandId?: string; search?: string }, { enabled = true }: { enabled?: boolean } = {}) {
  return useInfiniteQuery({
    queryKey: ["products", filter.categoryId ?? null, filter.search ?? null, filter.brandId ?? null],
    queryFn: ({ pageParam }) =>
      apiFetch<Paginated<Product>>("/catalog/products", {
        query: { limit: PRODUCTS_PAGE_SIZE, offset: pageParam, categoryId: filter.categoryId, brandId: filter.brandId, search: filter.search },
      }),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.offset + last.items.length < last.total ? last.offset + last.items.length : undefined),
    enabled,
  });
}

/** The product as already shown in a list or rail, so details open without a blank screen. */
function cachedProduct(queryClient: QueryClient, productId: string) {
  for (const [, data] of queryClient.getQueriesData<InfiniteData<Paginated<Product>>>({ queryKey: ["products"] })) {
    const found = data?.pages.flatMap((page) => page.items).find((product) => product.productId === productId);
    if (found) return found;
  }
  const lists = [
    ...queryClient.getQueriesData<{ items: Product[] }>({ queryKey: ["product-list"] }),
    ...queryClient.getQueriesData<{ items: Product[] }>({ queryKey: buyAgainKey }),
  ];
  const listed = lists.flatMap(([, data]) => data?.items ?? []).find((product) => product.productId === productId);
  if (listed) return listed;
  return queryClient
    .getQueriesData<HomeFeed | HomeTabPage>({ queryKey: ["home"] })
    .flatMap(([, data]) => data?.sections ?? [])
    .flatMap((section) => (section.type === "product_rail" || section.type === "deals_rail" ? section.products : []))
    .find((product) => product.productId === productId);
}

/** In-stock products often ordered together with the given ones, most frequent first. */
export function useAlsoBought(productIds: string[], { limit = 10 }: { limit?: number } = {}) {
  const ids = [...productIds].sort().slice(0, 30).join(",");
  return useQuery({
    queryKey: ["product-list", "also-bought", ids, limit],
    queryFn: () => apiFetch<{ items: Product[] }>("/catalog/products/also-bought", { query: { productIds: ids, limit } }),
    staleTime: 10 * 60_000,
    placeholderData: keepPreviousData,
    enabled: ids.length > 0,
  });
}

/** Brands with something in stock, most products first; optionally within one category. */
export function useBrands({ categoryId, limit = 20 }: { categoryId?: string; limit?: number } = {}) {
  return useQuery({
    queryKey: ["brands", categoryId ?? null, limit],
    queryFn: () => apiFetch<{ items: CatalogBrand[] }>("/catalog/brands", { query: { categoryId, limit } }),
    staleTime: 10 * 60_000,
  });
}

export function useProduct(productId: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ["product", productId],
    queryFn: () => apiFetch<ProductDetail>(`/catalog/products/${encodeURIComponent(productId)}`),
    placeholderData: () => {
      const cached = cachedProduct(queryClient, productId);
      return cached && detailPlaceholder(cached);
    },
  });
}
