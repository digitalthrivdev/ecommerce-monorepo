import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";

import { ApiError, apiFetch, errorMessage } from "./api";
import { readGuestWishlist, writeGuestWishlist } from "./guest-wishlist";
import { useSession } from "./session";
import type { Paginated, Product, WishlistItem } from "./types";

const PAGE_SIZE = 30;
export const WISHLIST_IDS_KEY = ["wishlist", "ids"] as const;
export const WISHLIST_ITEMS_KEY = ["wishlist", "items"] as const;

/** Ids of every saved product, for the hearts on cards and the product screen. */
export function useWishlistIds() {
  const { token } = useSession();
  const query = useQuery({
    queryKey: [...WISHLIST_IDS_KEY, token ? "user" : "guest"],
    queryFn: async () => {
      if (token) {
        try {
          return await apiFetch<{ productIds: string[] }>("/wishlist/ids");
        } catch {
          // If token fails or 401, fall back to guest wishlist
          const guestIds = await readGuestWishlist();
          return { productIds: guestIds };
        }
      }
      const guestIds = await readGuestWishlist();
      return { productIds: guestIds };
    },
    staleTime: 5 * 60_000,
    select: (data) => new Set(data.productIds),
  });
  return query.data;
}

/** Saved products, newest first, with their price and stock. */
export function useWishlist() {
  const { token } = useSession();
  return useInfiniteQuery({
    queryKey: [...WISHLIST_ITEMS_KEY, token ? "user" : "guest"],
    queryFn: async ({ pageParam }) => {
      if (token) {
        try {
          return await apiFetch<Paginated<WishlistItem>>("/wishlist", {
            query: { limit: PAGE_SIZE, offset: pageParam },
          });
        } catch (err) {
          if (!(err instanceof ApiError && (err.status === 401 || err.code === "UNAUTHORIZED"))) {
            throw err;
          }
          // If unauthorized, fall through to guest
        }
      }

      // Guest wishlist items
      const guestIds = await readGuestWishlist();
      if (!guestIds.length) {
        return { items: [], total: 0, offset: 0, limit: PAGE_SIZE };
      }

      const slice = guestIds.slice(pageParam, pageParam + PAGE_SIZE);
      const items = await Promise.all(
        slice.map(async (productId): Promise<WishlistItem> => {
          try {
            const product = await apiFetch<Product>(`/catalog/products/${encodeURIComponent(productId)}`);
            return {
              productId,
              name: product.name,
              imageUrl: product.imageUrl ?? null,
              addedAt: new Date().toISOString(),
              product,
            };
          } catch {
            return {
              productId,
              name: "Product",
              imageUrl: null,
              addedAt: new Date().toISOString(),
              product: null,
            };
          }
        }),
      );

      return {
        items,
        total: guestIds.length,
        offset: pageParam,
        limit: PAGE_SIZE,
      };
    },
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.offset + last.items.length < last.total ? last.offset + last.items.length : undefined,
  });
}

/** Saves or removes a product; the heart changes at once and goes back if the request fails. */
export function useToggleWishlist() {
  const queryClient = useQueryClient();
  const { token } = useSession();
  const queryKey = [...WISHLIST_IDS_KEY, token ? "user" : "guest"];

  return useMutation({
    mutationFn: async ({ productId, saved }: { productId: string; saved: boolean }) => {
      if (token) {
        try {
          return await apiFetch<{ productId: string; saved: boolean }>(
            `/wishlist/${encodeURIComponent(productId)}`,
            { method: saved ? "PUT" : "DELETE" },
          );
        } catch (err) {
          if (!(err instanceof ApiError && (err.status === 401 || err.code === "UNAUTHORIZED"))) {
            throw err;
          }
        }
      }
      // Guest mode
      const current = await readGuestWishlist();
      const updated = saved
        ? [productId, ...current.filter((id) => id !== productId)]
        : current.filter((id) => id !== productId);
      await writeGuestWishlist(updated);
      return { productId, saved };
    },
    onMutate: async ({ productId, saved }) => {
      await queryClient.cancelQueries({ queryKey: WISHLIST_IDS_KEY });
      const previous = queryClient.getQueryData<{ productIds: string[] }>(queryKey);
      queryClient.setQueriesData<{ productIds: string[] }>({ queryKey: WISHLIST_IDS_KEY }, (current) => {
        const others = (current?.productIds ?? []).filter((id) => id !== productId);
        return { productIds: saved ? [productId, ...others] : others };
      });
      return { previous };
    },
    onError: (error, _input, context) => {
      queryClient.setQueryData(queryKey, context?.previous);
      Alert.alert("Couldn't update your wishlist", errorMessage(error));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["wishlist"] });
    },
  });
}
