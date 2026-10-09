import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";

import { apiFetch, errorMessage } from "./api";
import type { Paginated, WishlistItem } from "./types";

const PAGE_SIZE = 30;
const idsKey = ["wishlist", "ids"] as const;

/** Ids of every saved product, for the hearts on cards and the product screen. */
export function useWishlistIds() {
  const query = useQuery({
    queryKey: idsKey,
    queryFn: () => apiFetch<{ productIds: string[] }>("/wishlist/ids"),
    staleTime: 5 * 60_000,
    select: (data) => new Set(data.productIds),
  });
  return query.data;
}

/** Saved products, newest first, with the store's price and stock when there is a store. */
export function useWishlist(storeId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ["wishlist", "items", storeId ?? null],
    queryFn: ({ pageParam }) => apiFetch<Paginated<WishlistItem>>("/wishlist", { query: { storeId, limit: PAGE_SIZE, offset: pageParam } }),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.offset + last.items.length < last.total ? last.offset + last.items.length : undefined),
  });
}

/** Saves or removes a product; the heart changes at once and goes back if the request fails. */
export function useToggleWishlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, saved }: { productId: string; saved: boolean }) =>
      apiFetch<{ productId: string; saved: boolean }>(`/wishlist/${encodeURIComponent(productId)}`, { method: saved ? "PUT" : "DELETE" }),
    onMutate: async ({ productId, saved }) => {
      await queryClient.cancelQueries({ queryKey: idsKey });
      const previous = queryClient.getQueryData<{ productIds: string[] }>(idsKey);
      queryClient.setQueryData<{ productIds: string[] }>(idsKey, (current) => {
        const others = (current?.productIds ?? []).filter((id) => id !== productId);
        return { productIds: saved ? [productId, ...others] : others };
      });
      return { previous };
    },
    onError: (error, _input, context) => {
      queryClient.setQueryData(idsKey, context?.previous);
      Alert.alert("Couldn't update your wishlist", errorMessage(error));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["wishlist"] }),
  });
}
