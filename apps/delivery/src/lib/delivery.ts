import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "./api";
import type { Earnings, Paginated, PartnerDelivery, PartnerProfile, PartnerStatus } from "./types";

const PROFILE_KEY = ["partner"] as const;
const ACTIVE_KEY = ["deliveries", "active"] as const;
const HISTORY_KEY = ["deliveries", "history"] as const;
const HISTORY_PAGE_SIZE = 20;
/** Backs up push notifications, which can be denied or unavailable (e.g. in Expo Go). */
const POLL_MS = 10_000;

const deliveryKey = (orderId: string) => ["delivery", orderId] as const;
const deliveryPath = (orderId: string) => `/delivery/orders/${encodeURIComponent(orderId)}`;

export function usePartner() {
  return useQuery({ queryKey: PROFILE_KEY, queryFn: () => apiFetch<PartnerProfile>("/delivery/me"), refetchInterval: 30_000 });
}

export function useSetPartnerStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status: Exclude<PartnerStatus, "BUSY">) => apiFetch<PartnerProfile>("/delivery/me/status", { method: "PATCH", body: { status } }),
    onSuccess: (profile) => queryClient.setQueryData(PROFILE_KEY, profile),
  });
}

/** Assigned and in-progress deliveries, polled while the partner is available for work. */
export function useActiveDeliveries({ poll }: { poll: boolean }) {
  return useQuery({
    queryKey: ACTIVE_KEY,
    queryFn: async () => (await apiFetch<{ items: PartnerDelivery[] }>("/delivery/orders")).items,
    refetchInterval: poll ? POLL_MS : false,
    staleTime: 5_000,
  });
}

export function useDelivery(orderId: string) {
  return useQuery({
    queryKey: deliveryKey(orderId),
    queryFn: () => apiFetch<PartnerDelivery>(deliveryPath(orderId)),
    refetchInterval: (query) => (query.state.data && query.state.data.allowedActions.length === 0 ? false : POLL_MS),
    staleTime: 5_000,
  });
}

type ActionInput = { action: "accept" | "pickup" | "start-delivery" } | { action: "decline" } | { action: "delivered"; otp: string };

/** Runs the next step of a delivery; every step can change the partner's status, so the profile is refetched too. */
export function useDeliveryAction(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ActionInput) =>
      apiFetch<PartnerDelivery | { declined: true }>(`${deliveryPath(orderId)}/${input.action}`, {
        method: "POST",
        body: input.action === "delivered" ? { otp: input.otp } : undefined,
      }),
    onSuccess: (result) => {
      if ("orderNumber" in result) queryClient.setQueryData(deliveryKey(orderId), result);
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ACTIVE_KEY }),
        queryClient.invalidateQueries({ queryKey: PROFILE_KEY }),
        queryClient.invalidateQueries({ queryKey: HISTORY_KEY }),
        queryClient.invalidateQueries({ queryKey: ["earnings"] }),
      ]),
  });
}

/** A calendar month in the phone's time zone; `month` is 0 for January. */
export type Month = { year: number; month: number };

export const currentMonth = (): Month => ({ year: new Date().getFullYear(), month: new Date().getMonth() });

/** Today so far, the last seven days, or a whole month (so far, for the current one). */
export type Period = "today" | "week" | Month;

const periodKey = (period: Period) => (typeof period === "string" ? period : `${period.year}-${period.month}`);

function periodRange(period: Period) {
  if (period === "today" || period === "week") {
    const from = new Date();
    if (period === "today") from.setHours(0, 0, 0, 0);
    else from.setDate(from.getDate() - 7);
    return { from: from.toISOString() };
  }
  const from = new Date(period.year, period.month, 1);
  const to = new Date(period.year, period.month + 1, 1);
  return { from: from.toISOString(), to: to < new Date() ? to.toISOString() : undefined };
}

export function useEarnings(period: Period) {
  return useQuery({
    queryKey: ["earnings", periodKey(period)],
    queryFn: () => apiFetch<Earnings>("/delivery/earnings", { query: periodRange(period) }),
    staleTime: 30_000,
  });
}

/** Finished deliveries in the period, newest first, a page at a time. */
export function useDeliveryHistory(period: Period) {
  return useInfiniteQuery({
    queryKey: [...HISTORY_KEY, periodKey(period)],
    queryFn: ({ pageParam }) =>
      apiFetch<Paginated<PartnerDelivery>>("/delivery/history", { query: { limit: HISTORY_PAGE_SIZE, offset: pageParam, ...periodRange(period) } }),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.offset + last.items.length < last.total ? last.offset + last.items.length : undefined),
  });
}

export const STEP_TEXT: Record<string, { title: string; detail: string }> = {
  ASSIGNED: { title: "New delivery", detail: "Accept it, then head to the store to pick it up." },
  PICKED_UP: { title: "Picked up", detail: "Start the delivery when you leave the store." },
  OUT_FOR_DELIVERY: { title: "On the way", detail: "Ask the customer for the delivery OTP when you arrive." },
  DELIVERED: { title: "Delivered", detail: "This delivery is complete." },
  CANCELLED: { title: "Cancelled", detail: "This order was cancelled." },
};

export function stepText(delivery: PartnerDelivery) {
  if (delivery.orderStatus === "ASSIGNED" && delivery.acceptedAt) {
    return { title: "Go to the store", detail: "Collect the packed order and mark it as picked up." };
  }
  return STEP_TEXT[delivery.orderStatus] ?? { title: delivery.orderStatus, detail: "" };
}

/** Google Maps directions; opens the Maps app when installed, the browser otherwise. */
export const directionsUrl = (latitude: string, longitude: string) => `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
