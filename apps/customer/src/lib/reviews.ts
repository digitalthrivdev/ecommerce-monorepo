import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "./api";
import type { OrderReviewItem, ProductReviews } from "./types";

export const RATING_TEXT = ["", "Very poor", "Poor", "Okay", "Good", "Excellent"] as const;

const productReviewsKey = (productId: string) => ["product-reviews", productId] as const;
const orderReviewsKey = (orderId: string) => ["order", orderId, "reviews"] as const;

/** The product's rating and its latest reviews with a comment. */
export function useProductReviews(productId: string, { limit = 5 }: { limit?: number } = {}) {
  return useQuery({
    queryKey: [...productReviewsKey(productId), limit],
    queryFn: () => apiFetch<ProductReviews>(`/products/${encodeURIComponent(productId)}/reviews`, { query: { limit } }),
    staleTime: 5 * 60_000,
  });
}

export function useOrderReviews(orderId: string, { enabled }: { enabled: boolean }) {
  return useQuery({
    queryKey: orderReviewsKey(orderId),
    queryFn: () => apiFetch<{ items: OrderReviewItem[] }>(`/orders/${encodeURIComponent(orderId)}/reviews`),
    enabled,
    staleTime: 60_000,
  });
}

/** `comment` left out keeps the current one; null or empty removes it. */
export type ReviewInput = { productId: string; rating: number; comment?: string | null };

/** Saves the customer's review of a product; `orderId` is the order screen to refresh. */
export function useReviewProduct(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, ...body }: ReviewInput) =>
      apiFetch<{ productId: string; rating: number; comment: string | null }>(`/products/${encodeURIComponent(productId)}/review`, { method: "PUT", body }),
    onSuccess: (saved) =>
      queryClient.setQueryData<{ items: OrderReviewItem[] }>(orderReviewsKey(orderId), (current) =>
        current && { items: current.items.map((item) => (item.productId === saved.productId ? { ...item, rating: saved.rating, comment: saved.comment } : item)) },
      ),
    onSettled: (_saved, _error, input) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: orderReviewsKey(orderId) }),
        queryClient.invalidateQueries({ queryKey: productReviewsKey(input.productId) }),
      ]),
  });
}
