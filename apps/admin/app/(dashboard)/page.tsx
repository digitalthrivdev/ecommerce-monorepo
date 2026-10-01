import type { Metadata } from "next";
import Link from "next/link";
import { Boxes, IndianRupee, PackageCheck, ShoppingBag, type LucideIcon } from "lucide-react";

import { OrderStatusBadge } from "@/components/order-status-badge";
import { PageHeader } from "@/components/page-header";
import { StoreFilter } from "@/components/store-filter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { getCurrentUser } from "@/lib/dal";
import { formatDateTime, formatMoney, formatNumber, ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/format";
import type { DashboardStats, Paginated, Store } from "@/lib/types";

export const metadata: Metadata = { title: "Dashboard" };

function StatCard({ title, value, hint, icon: Icon }: { title: string; value: string; hint: string; icon: LucideIcon }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardDescription>{title}</CardDescription>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const user = await getCurrentUser();
  const isAdmin = user.role === "ADMIN";
  const { storeId: requestedStoreId } = await searchParams;
  const storeId = isAdmin && typeof requestedStoreId === "string" ? requestedStoreId : undefined;

  const [stats, stores] = await Promise.all([
    apiFetch<DashboardStats>("/dashboard", { query: { storeId } }),
    isAdmin ? apiFetch<Paginated<Store>>("/stores", { query: { includeInactive: true, limit: 100 } }) : null,
  ]);

  const money = (amount: string) => formatMoney(amount, stats.currency);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={isAdmin ? "Today across your stores" : `Today at ${user.store?.name}`}
        actions={stores && stores.items.length > 1 && <StoreFilter stores={stores.items} />}
      />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Orders today"
            value={formatNumber(stats.today.orders)}
            hint={`${stats.today.delivered} delivered · ${stats.today.cancelled} cancelled`}
            icon={ShoppingBag}
          />
          <StatCard
            title="Revenue today"
            value={money(stats.today.revenue)}
            hint="Excludes cancelled and unpaid orders"
            icon={IndianRupee}
          />
          <StatCard
            title="Active orders"
            value={formatNumber(stats.activeOrders)}
            hint={`${stats.awaitingAssignment} ready for pickup`}
            icon={PackageCheck}
          />
          <StatCard
            title="Low stock"
            value={formatNumber(stats.lowStock.count)}
            hint={`Available products with ${stats.lowStock.threshold} or fewer in stock`}
            icon={Boxes}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Recent orders</CardTitle>
              <CardDescription>The latest confirmed orders</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.recentOrders.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No orders yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Customer</TableHead>
                      {isAdmin && !storeId && <TableHead>Store</TableHead>}
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.recentOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell>
                          <Link href={`/orders/${order.id}`} className="font-medium underline-offset-4 hover:underline">
                            {order.orderNumber}
                          </Link>
                          <div className="text-xs text-muted-foreground">{formatDateTime(order.createdAt, stats.timezone)}</div>
                        </TableCell>
                        <TableCell>{order.customerName}</TableCell>
                        {isAdmin && !storeId && <TableCell>{order.store.name}</TableCell>}
                        <TableCell>
                          <OrderStatusBadge status={order.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="tabular-nums">{money(order.total)}</div>
                          <div className="text-xs text-muted-foreground">{PAYMENT_METHOD_LABELS[order.paymentMethod]}</div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Order pipeline</CardTitle>
                <CardDescription>Orders currently in progress</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="flex flex-col gap-2 text-sm">
                  {Object.entries(stats.pipeline).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between">
                      <dt className="text-muted-foreground">{ORDER_STATUS_LABELS[status as keyof typeof stats.pipeline]}</dt>
                      <dd className="font-medium tabular-nums">{count}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>

            {stats.partners && (
              <Card>
                <CardHeader>
                  <CardTitle>Delivery partners</CardTitle>
                  <CardDescription>Active partner accounts</CardDescription>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-3 gap-2 text-center">
                    {(
                      [
                        ["Online", stats.partners.online],
                        ["Busy", stats.partners.busy],
                        ["Offline", stats.partners.offline],
                      ] as const
                    ).map(([label, count]) => (
                      <div key={label} className="rounded-lg bg-muted/50 p-3">
                        <dd className="text-xl font-semibold tabular-nums">{count}</dd>
                        <dt className="text-xs text-muted-foreground">{label}</dt>
                      </div>
                    ))}
                  </dl>
                  {stats.customers !== null && (
                    <p className="mt-4 text-sm text-muted-foreground">
                      {formatNumber(stats.customers)} registered customers
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
