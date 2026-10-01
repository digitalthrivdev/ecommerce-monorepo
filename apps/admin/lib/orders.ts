import "server-only";

import { notFound } from "next/navigation";

import { ApiError, apiFetch } from "./api";
import type { DashboardUser, OrderDetail, OrderList, OrderStatus } from "./types";

export type OrderListParams = {
  status?: OrderStatus[];
  q?: string;
  storeId?: string;
  sort: "newest" | "oldest";
  limit: number;
  offset: number;
};

/** Admins list every store (optionally filtered); staff always list their own store. */
export function listOrders(user: DashboardUser, { status, q, storeId, sort, limit, offset }: OrderListParams) {
  const query = { status: status?.join(","), q, sort, limit, offset };

  if (user.role === "ADMIN") {
    return apiFetch<OrderList>("/admin/orders", { query: { ...query, storeId } });
  }
  return apiFetch<OrderList>(`/stores/${encodeURIComponent(user.store!.id)}/orders`, { query });
}

export async function getOrder(user: DashboardUser, orderId: string) {
  const path =
    user.role === "ADMIN"
      ? `/admin/orders/${encodeURIComponent(orderId)}`
      : `/stores/${encodeURIComponent(user.store!.id)}/orders/${encodeURIComponent(orderId)}`;

  try {
    return await apiFetch<OrderDetail>(path);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      notFound();
    }
    throw error;
  }
}
