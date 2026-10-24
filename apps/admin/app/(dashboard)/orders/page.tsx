import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { ClipboardList, Search } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { NextStepButton } from "@/components/orders/order-actions";
import { PageHeader } from "@/components/page-header";
import { PageTabs } from "@/components/page-tabs";
import { PaginationLinks } from "@/components/pagination-links";
import { PageBody, Panel } from "@/components/section";
import { OrderStatusPill, ReviewAccountPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getActiveCarrier, getCurrentUser, getPublicSettings } from "@/lib/dal";
import { formatDateTime, formatMoney } from "@/lib/format";
import { listOrders } from "@/lib/orders";
import type { OrderListItem, OrderStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Orders" };

const PAGE_SIZE = 25;

type Tab = { id: string; label: string; statuses?: OrderStatus[]; adminOnly?: boolean; oldestFirst?: boolean };

const TABS: Tab[] = [
  { id: "active", label: "In progress", statuses: ["CONFIRMED", "PACKED", "SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY"], oldestFirst: true },
  { id: "delivered", label: "Delivered", statuses: ["DELIVERED"] },
  { id: "rto", label: "Not delivered (RTO)", statuses: ["RTO"] },
  { id: "cancelled", label: "Cancelled", statuses: ["CANCELLED"] },
  { id: "unpaid", label: "Waiting for payment", statuses: ["PENDING_PAYMENT"], adminOnly: true },
  { id: "all", label: "All" },
];

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function payment(order: OrderListItem, currency: string) {
  return order.paymentMethod === "COD" ? `Cash ${formatMoney(order.total, currency)}` : `Paid online · ${formatMoney(order.total, currency)}`;
}

function shipmentLine(order: OrderListItem) {
  const shipment = order.shipment;
  if (!shipment?.awb || shipment.status === "CANCELLED") return null;
  return [shipment.courierName, `AWB ${shipment.awb}`].filter(Boolean).join(" · ");
}

export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const user = await getCurrentUser();
  const isAdmin = user.role === "ADMIN";
  const params = await searchParams;

  const q = first(params.q)?.trim().slice(0, 50) || undefined;
  const tabs = TABS.filter((tab) => isAdmin || !tab.adminOnly);
  const tab = tabs.find((candidate) => candidate.id === first(params.tab)) ?? (q ? tabs.at(-1)! : tabs[0]!);
  const page = Math.max(1, Number.parseInt(first(params.page) ?? "1", 10) || 1);

  const [orders, settings, carrier] = await Promise.all([
    listOrders({
      status: tab.statuses,
      q,
      sort: tab.oldestFirst ? "oldest" : "newest",
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    getPublicSettings(),
    getActiveCarrier(),
  ]);

  const href = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { tab: tab.id, q, ...changes };
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

  const lastPage = Math.max(1, Math.ceil(orders.total / PAGE_SIZE));
  const currency = settings.currency;

  return (
    <>
      <PageHeader title="Orders" />

      <PageBody className="gap-4">
        <div className="flex flex-col gap-3">
          <PageTabs
            label="Order status"
            active={tab.id}
            tabs={tabs.map((candidate) => {
              const count = countFor(candidate);
              return {
                id: candidate.id,
                label: candidate.label,
                href: href({ tab: candidate.id, page: undefined }),
                badge: count > 0 && candidate.id !== "all" && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">{count}</span>
                ),
              };
            })}
          />
          <Form action="/orders" className="flex max-w-md gap-2">
            <input type="hidden" name="tab" value={tab.id} />
            <Input
              name="q"
              type="search"
              defaultValue={q}
              maxLength={50}
              placeholder="Order number, phone or name"
              aria-label="Search orders"
            />
            <Button type="submit" variant="outline" size="icon" aria-label="Search">
              <Search />
            </Button>
          </Form>
        </div>

        <Panel>
          {orders.items.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title={q ? `No orders match “${q}”` : "No orders here"}
              description={q ? "Check the order number or phone number, or search in All." : undefined}
            />
          ) : (
            <>
              <ul className="divide-y md:hidden">
                {orders.items.map((order) => (
                  <li key={order.id} className="relative flex flex-col gap-1.5 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/orders/${order.id}`} className="font-semibold break-all after:absolute after:inset-0">
                        {order.orderNumber}
                      </Link>
                      <OrderStatusPill status={order.status} />
                    </div>
                    {order.reviewAccount && <ReviewAccountPill />}
                    <p className="text-sm">
                      {order.customerName}
                      <span className="text-muted-foreground">
                        {" "}
                        · {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {payment(order, currency)} · {formatDateTime(order.createdAt, settings.timezone)}
                    </p>
                    {shipmentLine(order) && <p className="text-xs text-muted-foreground">{shipmentLine(order)}</p>}
                  </li>
                ))}
              </ul>
              <Table className="hidden md:table">
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="pr-4 text-right">
                      <span className="sr-only">Next step</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.items.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="pl-4">
                        <Link href={`/orders/${order.id}`} className="font-semibold underline-offset-4 hover:underline">
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
                        {order.reviewAccount && <ReviewAccountPill />}
                      </TableCell>
                      <TableCell>
                        <OrderStatusPill status={order.status} />
                        {shipmentLine(order) && <div className="mt-1 text-xs text-muted-foreground">{shipmentLine(order)}</div>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="tabular-nums">{formatMoney(order.total, currency)}</div>
                        <div className="text-xs text-muted-foreground">
                          {order.paymentMethod === "COD" ? "Cash" : "Online"}
                        </div>
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <NextStepButton
                          orderId={order.id}
                          orderNumber={order.orderNumber}
                          status={order.status}
                          allowedActions={order.allowedActions}
                          carrier={carrier}
                          size="default"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </Panel>

        {orders.total > PAGE_SIZE && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, orders.total)} of {orders.total}
            </span>
            <PaginationLinks page={page} lastPage={lastPage} href={(target) => href({ page: String(target) })} />
          </div>
        )}
      </PageBody>
    </>
  );
}
