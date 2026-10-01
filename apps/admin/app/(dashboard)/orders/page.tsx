import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Search } from "lucide-react";

import { AutoRefresh } from "@/components/auto-refresh";
import { AdvanceOrderButton } from "@/components/orders/order-actions";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { PageHeader } from "@/components/page-header";
import { PaginationLinks } from "@/components/pagination-links";
import { StoreFilter } from "@/components/store-filter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { getCurrentUser, getPublicSettings } from "@/lib/dal";
import { formatDateTime, formatMoney, PAYMENT_METHOD_LABELS } from "@/lib/format";
import { listOrders } from "@/lib/orders";
import type { OrderStatus, Paginated, Store } from "@/lib/types";

export const metadata: Metadata = { title: "Orders" };

const PAGE_SIZE = 25;

type Tab = { id: string; label: string; statuses?: OrderStatus[]; adminOnly?: boolean; oldestFirst?: boolean };

const TABS: Tab[] = [
  {
    id: "active",
    label: "In progress",
    statuses: ["CONFIRMED", "STORE_ACCEPTED", "PICKING", "PACKED", "READY_FOR_PICKUP", "ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"],
    oldestFirst: true,
  },
  { id: "new", label: "New", statuses: ["CONFIRMED"], oldestFirst: true },
  { id: "preparing", label: "Preparing", statuses: ["STORE_ACCEPTED", "PICKING", "PACKED"], oldestFirst: true },
  { id: "ready", label: "Ready for pickup", statuses: ["READY_FOR_PICKUP"], oldestFirst: true },
  { id: "delivery", label: "Out for delivery", statuses: ["ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"], oldestFirst: true },
  { id: "delivered", label: "Delivered", statuses: ["DELIVERED"] },
  { id: "cancelled", label: "Cancelled", statuses: ["CANCELLED"] },
  { id: "unpaid", label: "Awaiting payment", statuses: ["PENDING_PAYMENT"], adminOnly: true },
  { id: "all", label: "All" },
];

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const user = await getCurrentUser();
  const isAdmin = user.role === "ADMIN";
  const params = await searchParams;

  const tabs = TABS.filter((tab) => isAdmin || !tab.adminOnly);
  const tab = tabs.find((candidate) => candidate.id === first(params.tab)) ?? tabs[0]!;
  const q = first(params.q)?.trim().slice(0, 50) || undefined;
  const storeId = isAdmin ? first(params.storeId) || undefined : undefined;
  const page = Math.max(1, Number.parseInt(first(params.page) ?? "1", 10) || 1);

  const [orders, stores, settings] = await Promise.all([
    listOrders(user, {
      status: tab.statuses,
      q,
      storeId,
      sort: tab.oldestFirst ? "oldest" : "newest",
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    isAdmin ? apiFetch<Paginated<Store>>("/stores", { query: { includeInactive: true, limit: 100 } }) : null,
    getPublicSettings(),
  ]);

  const href = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { tab: tab.id, q, storeId, ...changes };
    for (const [key, value] of Object.entries(merged)) {
      if (value) next.set(key, value);
    }
    const query = next.toString();
    return query ? `/orders?${query}` : "/orders";
  };

  const countFor = (candidate: Tab) =>
    candidate.statuses
      ? candidate.statuses.reduce((sum, status) => sum + (orders.statusCounts[status] ?? 0), 0)
      : Object.values(orders.statusCounts).reduce((sum, count) => sum + (count ?? 0), 0);

  const showStore = isAdmin && !storeId;
  const lastPage = Math.max(1, Math.ceil(orders.total / PAGE_SIZE));

  return (
    <>
      <AutoRefresh seconds={30} />
      <PageHeader
        title="Orders"
        description={isAdmin ? "Orders across all stores" : `Orders for ${user.store?.name}`}
        actions={stores && stores.items.length > 1 && <StoreFilter stores={stores.items} />}
      />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <nav aria-label="Order status" className="flex flex-wrap gap-1">
            {tabs.map((candidate) => {
              const active = candidate.id === tab.id;
              const count = countFor(candidate);
              return (
                <Button key={candidate.id} asChild size="sm" variant={active ? "secondary" : "ghost"}>
                  <Link href={href({ tab: candidate.id })} aria-current={active ? "page" : undefined}>
                    {candidate.label}
                    {count > 0 && (
                      <Badge variant={candidate.id === "new" ? "default" : "outline"} className="ml-1 tabular-nums">
                        {count}
                      </Badge>
                    )}
                  </Link>
                </Button>
              );
            })}
          </nav>

          <Form action="/orders" className="flex gap-2">
            <input type="hidden" name="tab" value={tab.id} />
            {storeId && <input type="hidden" name="storeId" value={storeId} />}
            <Input
              name="q"
              type="search"
              defaultValue={q}
              maxLength={50}
              placeholder="Order number, phone or name"
              aria-label="Search orders"
              className="w-64"
            />
            <Button type="submit" variant="outline" size="icon" aria-label="Search">
              <Search />
            </Button>
          </Form>
        </div>

        <Card>
          <CardContent>
            {orders.items.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {q ? `No orders match “${q}”.` : "No orders here right now."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Customer</TableHead>
                    {showStore && <TableHead>Store</TableHead>}
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">Next step</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.items.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <Link href={`/orders/${order.id}`} className="font-medium underline-offset-4 hover:underline">
                          {order.orderNumber}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {formatDateTime(order.createdAt, settings.timezone)} · {order.itemCount}{" "}
                          {order.itemCount === 1 ? "item" : "items"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>{order.customerName}</div>
                        <div className="text-xs text-muted-foreground">{order.customerPhone}</div>
                      </TableCell>
                      {showStore && <TableCell>{order.store.name}</TableCell>}
                      <TableCell>
                        <OrderStatusBadge status={order.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="tabular-nums">{formatMoney(order.total, settings.currency)}</div>
                        <div className="text-xs text-muted-foreground">{PAYMENT_METHOD_LABELS[order.paymentMethod]}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <AdvanceOrderButton storeId={order.store.id} orderId={order.id} allowedActions={order.allowedActions} />
                        {order.allowedActions.includes("assign") && (
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/orders/${order.id}`}>Assign partner</Link>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {orders.total > PAGE_SIZE && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, orders.total)} of {orders.total}
            </span>
            <PaginationLinks page={page} lastPage={lastPage} href={(target) => href({ page: String(target) })} />
          </div>
        )}
      </div>
    </>
  );
}
