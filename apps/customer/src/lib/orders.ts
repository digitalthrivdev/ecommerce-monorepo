import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError, apiFetch } from "./api";
import { CART_KEY } from "./cart";
import type { OrderDetail, OrderStatus, OrderSummary, Paginated, PaymentMethod } from "./types";

const ORDERS_KEY = ["orders"] as const;
const ORDERS_PAGE_SIZE = 20;
const LIVE_REFRESH_MS = 15_000;

const orderKey = (id: string) => ["order", id] as const;
const orderPath = (id: string) => `/orders/${encodeURIComponent(id)}`;

export const isOrderFinished = (status: OrderStatus) => status === "DELIVERED" || status === "CANCELLED";

export function useOrders() {
  return useInfiniteQuery({
    queryKey: ORDERS_KEY,
    queryFn: ({ pageParam }) => apiFetch<Paginated<OrderSummary>>("/orders", { query: { limit: ORDERS_PAGE_SIZE, offset: pageParam } }),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.offset + last.items.length < last.total ? last.offset + last.items.length : undefined),
    staleTime: 15_000,
  });
}

/** Polls for status changes until the order is delivered or cancelled. */
export function useOrder(id: string) {
  return useQuery({
    queryKey: orderKey(id),
    queryFn: () => apiFetch<OrderDetail>(orderPath(id)),
    staleTime: 10_000,
    refetchInterval: (query) => (query.state.data && isOrderFinished(query.state.data.status) ? false : LIVE_REFRESH_MS),
  });
}

/** The server rebuilds the order from the cart, so the cart is refetched whether or not it succeeds. */
export function usePlaceOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { addressId: string; paymentMethod: PaymentMethod }) => apiFetch<OrderDetail>("/orders", { method: "POST", body: input }),
    onSuccess: (order) => queryClient.setQueryData(orderKey(order.id), order),
    onSettled: () => Promise.all([queryClient.invalidateQueries({ queryKey: CART_KEY }), queryClient.invalidateQueries({ queryKey: ORDERS_KEY })]),
  });
}

export function useCancelOrder(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<OrderDetail>(`${orderPath(id)}/cancel`, { method: "POST" }),
    onSuccess: (order) => queryClient.setQueryData(orderKey(id), order),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ORDERS_KEY }),
  });
}

type PaymentSession = { provider: string; providerOrderId: string; amount: string; expiresAt: string; checkout: { payUrl?: string } };
type MockCheckoutResult = { providerPaymentId: string; signature?: string; error?: string };

/**
 * Pays through the development mock provider: start the payment, let the mock checkout succeed or
 * fail, then have the server verify the signed result. A real provider's SDK replaces the middle step.
 */
export function usePayOnline(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (outcome: "success" | "failure") => {
      const session = await apiFetch<PaymentSession>(`${orderPath(id)}/payment`, { method: "POST" });
      if (session.provider !== "mock" || !session.checkout.payUrl) {
        throw new ApiError(400, "PROVIDER_UNSUPPORTED", "Online payment isn't supported in this version of the app.");
      }
      const result = await apiFetch<MockCheckoutResult>(session.checkout.payUrl, {
        method: "POST",
        body: { providerOrderId: session.providerOrderId, outcome },
      });
      if (!result.signature) throw new ApiError(402, "PAYMENT_FAILED", result.error ?? "Payment failed. Please try again.");
      return apiFetch<OrderDetail>(`${orderPath(id)}/payment/verify`, {
        method: "POST",
        body: { providerPaymentId: result.providerPaymentId, signature: result.signature },
      });
    },
    onSuccess: (order) => queryClient.setQueryData(orderKey(id), order),
    onSettled: () => Promise.all([queryClient.invalidateQueries({ queryKey: orderKey(id) }), queryClient.invalidateQueries({ queryKey: ORDERS_KEY })]),
  });
}

export const ORDER_STATUS_TEXT: Record<OrderStatus, { title: string; detail: string }> = {
  PENDING_PAYMENT: { title: "Waiting for payment", detail: "Complete the payment to confirm your order." },
  CONFIRMED: { title: "Order confirmed", detail: "The store will start packing your order soon." },
  STORE_ACCEPTED: { title: "Accepted by the store", detail: "Your order is next in line for packing." },
  PICKING: { title: "Packing your order", detail: "The store is picking your items." },
  PACKED: { title: "Order packed", detail: "Your items are packed and ready to go." },
  READY_FOR_PICKUP: { title: "Ready for pickup", detail: "Waiting for a delivery partner to collect it." },
  ASSIGNED: { title: "Delivery partner assigned", detail: "Your delivery partner is heading to the store." },
  PICKED_UP: { title: "Picked up", detail: "Your order has left the store." },
  OUT_FOR_DELIVERY: { title: "On the way", detail: "Your order is on its way to you." },
  DELIVERED: { title: "Delivered", detail: "Enjoy your order!" },
  CANCELLED: { title: "Cancelled", detail: "This order was cancelled." },
};

export const ORDER_STEPS = ["Confirmed", "Packing", "Packed", "On the way", "Delivered"] as const;

const STEP_INDEX: Partial<Record<OrderStatus, number>> = {
  CONFIRMED: 0,
  STORE_ACCEPTED: 1,
  PICKING: 1,
  PACKED: 2,
  READY_FOR_PICKUP: 2,
  ASSIGNED: 3,
  PICKED_UP: 3,
  OUT_FOR_DELIVERY: 3,
  DELIVERED: 4,
};

/** Position in `ORDER_STEPS`, or null for orders awaiting payment or cancelled. */
export const orderStep = (status: OrderStatus) => STEP_INDEX[status] ?? null;
