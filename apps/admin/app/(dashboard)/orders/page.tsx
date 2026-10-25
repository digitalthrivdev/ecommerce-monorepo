import type { Metadata } from "next";
import Form from "next/form";
import { ClipboardList, Search } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { OrdersTable } from "@/components/orders/orders-table";
import { PageHeader } from "@/components/page-header";
import { PageTabs } from "@/components/page-tabs";
import { PaginationLinks } from "@/components/pagination-links";
import { PageBody, Panel } from "@/components/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getActiveCarrier, getCurrentUser, getPublicSettings } from "@/lib/dal";
import { listOrders } from "@/lib/orders";
import type { OrderStatus } from "@/lib/types";

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
            <OrdersTable
              orders={orders.items}
              currency={currency}
              timezone={settings.timezone}
              carrier={carrier}
            />
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
