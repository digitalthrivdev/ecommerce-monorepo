import "server-only";

import { notFound } from "next/navigation";

import { ApiError, apiFetch } from "./api";
import type { AttentionList, OrderDetail, OrderList, OrderStatus } from "./types";

export type OrderListParams = {
  status?: OrderStatus[];
  q?: string;
  sort: "newest" | "oldest";
  limit: number;
  offset: number;
};

export function listOrders({ status, q, sort, limit, offset }: OrderListParams) {
  return apiFetch<OrderList>("/admin/orders", { query: { status: status?.join(","), q, sort, limit, offset } });
}

/** Orders nobody has picked up in time (admins only). */
export function getAttention() {
  return apiFetch<AttentionList>("/admin/orders/attention");
}

export async function getOrder(orderId: string) {
  try {
    return await apiFetch<OrderDetail>(`/admin/orders/${encodeURIComponent(orderId)}`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      notFound();
    }
    throw error;
  }
}
