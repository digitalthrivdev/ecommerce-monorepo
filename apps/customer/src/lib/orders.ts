import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

import { apiFetch } from "./api";
import { CART_KEY } from "./cart";
import type { ComplaintReason, OrderDetail, OrderRating, OrderStatus, OrderSummary, Paginated, PaymentMethod, Product, ShipmentStatus } from "./types";

const ORDERS_KEY = ["orders"] as const;
const ORDERS_PAGE_SIZE = 20;
const LIVE_REFRESH_MS = 15_000;

const orderKey = (id: string) => ["order", id] as const;
const orderPath = (id: string) => `/orders/${encodeURIComponent(id)}`;

export const isOrderFinished = (status: OrderStatus) => status === "DELIVERED" || status === "CANCELLED" || status === "RTO";

export function useOrders() {
  return useInfiniteQuery({
    queryKey: ORDERS_KEY,
    queryFn: ({ pageParam }) => apiFetch<Paginated<OrderSummary>>("/orders", { query: { limit: ORDERS_PAGE_SIZE, offset: pageParam } }),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.offset + last.items.length < last.total ? last.offset + last.items.length : undefined),
    staleTime: 15_000,
  });
}

/** Orders still in progress, newest first. Polls while there are any, so the list empties once they finish. */
export function useActiveOrders() {
  return useQuery({
    queryKey: [...ORDERS_KEY, "active"],
    queryFn: () => apiFetch<Paginated<OrderSummary>>("/orders", { query: { active: true, limit: 5 } }),
    staleTime: 10_000,
    refetchInterval: (query) => (query.state.data?.total ? LIVE_REFRESH_MS : false),
  });
}

export const buyAgainKey = [...ORDERS_KEY, "buy-again"] as const;

/** Products from the customer's past orders that are in stock, most often ordered first. */
export function useBuyAgain({ limit = 12 }: { limit?: number } = {}) {
  return useQuery({
    queryKey: [...buyAgainKey, limit],
    queryFn: () => apiFetch<{ items: Product[] }>("/orders/buy-again", { query: { limit } }),
    staleTime: 5 * 60_000,
  });
}

/** Polls for status changes until the order is delivered, cancelled or returned. */
export function useOrder(id: string) {
  return useQuery({
    queryKey: orderKey(id),
    queryFn: () => apiFetch<OrderDetail>(orderPath(id)),
    staleTime: 10_000,
    refetchInterval: (query) => (query.state.data && isOrderFinished(query.state.data.status) ? false : LIVE_REFRESH_MS),
  });
}

/**
 * The server rebuilds the order from the cart, so the cart is refetched whether or not it succeeds.
 * The refetch is not awaited: the emptied cart would replace the checkout before the caller could
 * open the new order.
 */
export function usePlaceOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { addressId: string; paymentMethod: PaymentMethod }) => apiFetch<OrderDetail>("/orders", { method: "POST", body: input }),
    onSuccess: (order) => queryClient.setQueryData(orderKey(order.id), order),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: CART_KEY });
      void queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
    },
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

export const COMPLAINT_REASON_TEXT: Record<ComplaintReason, string> = {
  DAMAGED: "Damaged item",
  WRONG_ITEM: "Wrong item",
  MISSING: "Missing item",
  EXPIRED: "Expired or poor quality",
  OTHER: "Something else",
};

export type ComplaintInput = {
  reason: ComplaintReason;
  note?: string;
  items: { orderItemId: string; quantity: number }[];
  photoUrls: string[];
};

export function useReportIssue(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ComplaintInput) => apiFetch<{ ok: true }>(`${orderPath(id)}/complaint`, { method: "POST", body: input }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: orderKey(id) }),
  });
}

export type RatingInput = { deliveryRating: number; itemsRating?: number; comment?: string };

export function useRateOrder(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RatingInput) => apiFetch<OrderRating>(`${orderPath(id)}/rating`, { method: "POST", body: input }),
    onSettled: () => Promise.all([queryClient.invalidateQueries({ queryKey: orderKey(id) }), queryClient.invalidateQueries({ queryKey: ORDERS_KEY })]),
  });
}

/** Opens the invoice PDF in the browser through a link that works for a few minutes, so the app needs no file access. */
export function useOpenInvoice(id: string) {
  return useMutation({
    mutationFn: async () => {
      const link = await apiFetch<{ url: string; expiresAt: string }>(`${orderPath(id)}/invoice-link`, { method: "POST" });
      await Linking.openURL(link.url);
    },
  });
}

const PHOTO_UPLOAD_TIMEOUT_MS = 60_000;

/** Uploads one photo for a report about the order; its URL is then sent with the report. */
export function uploadComplaintPhoto(orderId: string, photo: { uri: string; mimeType?: string; fileName?: string | null }) {
  const form = new FormData();
  // React Native's FormData takes a file as { uri, name, type }.
  form.append("file", { uri: photo.uri, name: photo.fileName ?? "photo.jpg", type: photo.mimeType ?? "image/jpeg" } as unknown as Blob);
  return apiFetch<{ url: string; smallUrl: string }>(`${orderPath(orderId)}/complaint/photos`, { method: "POST", body: form, timeoutMs: PHOTO_UPLOAD_TIMEOUT_MS });
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
  CONFIRMED: { title: "Order confirmed", detail: "We'll start packing your order soon." },
  PACKED: { title: "Order packed", detail: "Your items are packed and will be shipped soon." },
  SHIPPED: { title: "Shipped", detail: "Your order is with the courier." },
  IN_TRANSIT: { title: "In transit", detail: "Your order is on its way to you." },
  OUT_FOR_DELIVERY: { title: "Out for delivery", detail: "Your order will be delivered today." },
  DELIVERED: { title: "Delivered", detail: "Enjoy your order!" },
  CANCELLED: { title: "Cancelled", detail: "This order was cancelled." },
  RTO: { title: "Returned to seller", detail: "We couldn't deliver this order, so it's coming back to us. We'll be in touch." },
};

export const ORDER_STEPS = ["Confirmed", "Packed", "Shipped", "Out for delivery", "Delivered"] as const;

const STEP_INDEX: Partial<Record<OrderStatus, number>> = {
  CONFIRMED: 0,
  PACKED: 1,
  SHIPPED: 2,
  IN_TRANSIT: 2,
  OUT_FOR_DELIVERY: 3,
  DELIVERED: 4,
};

/** Position in `ORDER_STEPS`, or null for orders awaiting payment, cancelled or returned. */
export const orderStep = (status: OrderStatus) => STEP_INDEX[status] ?? null;

export const SHIPMENT_STATUS_TEXT: Record<ShipmentStatus, string> = {
  PENDING: "Pending",
  AWB_ASSIGNED: "Booked with the courier",
  PICKUP_SCHEDULED: "Pickup scheduled",
  PICKED_UP: "Picked up",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  NDR: "Delivery attempt failed",
  RTO_IN_TRANSIT: "Returning to seller",
  RTO_DELIVERED: "Returned to seller",
  CANCELLED: "Cancelled",
  LOST: "Lost",
};
