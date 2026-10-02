import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

import { apiFetch } from "./api";
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

type PaymentSession = { provider: string; testMode: boolean; amount: string; expiresAt: string; checkoutUrl: string };

/** How checkout ended, as reported by the server when it sends the browser back to the app. */
export type PaymentResult = "success" | "failed" | "cancelled" | "pending";

const PAYMENT_RESULTS: readonly string[] = ["success", "failed", "cancelled", "pending"];

/** Route the payment page returns to; see `app/(app)/payment-return.tsx`. */
export const PAYMENT_RETURN_PATH = "payment-return";

/**
 * Pays on the gateway's hosted checkout (Razorpay, Cashfree, …) in an in-app browser. The server
 * verifies the payment and sends the browser back to the app; the order is then refetched, since
 * the server's record, not the browser result, decides whether the order is paid.
 */
export function usePayOnline(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<PaymentResult> => {
      const returnUrl = Linking.createURL(PAYMENT_RETURN_PATH);
      const session = await apiFetch<PaymentSession>(`${orderPath(id)}/payment`, { method: "POST", body: { returnUrl } });
      // An ephemeral session skips iOS's "wants to sign in" prompt; checkout needs no saved cookies.
      const result = await WebBrowser.openAuthSessionAsync(session.checkoutUrl, returnUrl, { preferEphemeralSession: true });
      if (result.type !== "success") return "cancelled";
      const status = Linking.parse(result.url).queryParams?.status;
      return typeof status === "string" && PAYMENT_RESULTS.includes(status) ? (status as PaymentResult) : "pending";
    },
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
