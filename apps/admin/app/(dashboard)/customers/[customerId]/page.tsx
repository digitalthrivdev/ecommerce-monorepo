import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { OrderStatusBadge } from "@/components/order-status-badge";
import { PageHeader } from "@/components/page-header";
import { PaginationLinks } from "@/components/pagination-links";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, apiFetch } from "@/lib/api";
import { getPublicSettings, requireAdmin } from "@/lib/dal";
import { formatDateTime, formatMoney, formatTimeAgo, PAYMENT_METHOD_LABELS } from "@/lib/format";
import type { CustomerAddress, CustomerDetails, CustomerOrder, Paginated } from "@/lib/types";

export const metadata: Metadata = { title: "Customer" };

const PAGE_SIZE = 20;

async function getCustomer(id: string) {
  try {
    return await apiFetch<CustomerDetails>(`/admin/customers/${encodeURIComponent(id)}`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardHeader>
    </Card>
  );
}

function AddressBlock({ address }: { address: CustomerAddress }) {
  const hasLocation = address.latitude !== null && address.longitude !== null;
  return (
    <li className="flex flex-col gap-1 py-3 text-sm first:pt-0 last:pb-0">
      <div className="flex items-center gap-2">
        <span className="font-medium">{address.label ?? "Address"}</span>
        {address.isDefault && <Badge variant="secondary">Default</Badge>}
      </div>
      <p>
        {address.name} · {address.phone}
      </p>
      <p className="text-muted-foreground">
        {[address.addressLine1, address.addressLine2, address.landmark && `Near ${address.landmark}`].filter(Boolean).join(", ")}
        <br />
        {address.city}, {address.state} {address.postalCode}
      </p>
      {hasLocation && (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${address.latitude},${address.longitude}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1 text-xs underline-offset-4 hover:underline"
        >
          <ExternalLink className="size-3" />
          Open in Maps
        </a>
      )}
    </li>
  );
}

export default async function CustomerPage({ params, searchParams }: PageProps<"/customers/[customerId]">) {
  await requireAdmin();
  const { customerId } = await params;
  const pageParam = (await searchParams).page;
  const page = Math.max(1, Number.parseInt((Array.isArray(pageParam) ? pageParam[0] : pageParam) ?? "1", 10) || 1);

  const customer = await getCustomer(customerId);
  const [orders, settings] = await Promise.all([
    apiFetch<Paginated<CustomerOrder>>(`/admin/customers/${encodeURIComponent(customer.id)}/orders`, {
      query: { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
    }),
    getPublicSettings(),
  ]);
  const money = (amount: string) => formatMoney(amount, settings.currency);
  const lastPage = Math.max(1, Math.ceil(orders.total / PAGE_SIZE));
  const pageHref = (target: number) => (target > 1 ? `/customers/${customer.id}?page=${target}` : `/customers/${customer.id}`);
  const { stats } = customer;

  return (
    <>
      <PageHeader
        title={customer.name ?? customer.phone}
        description={[customer.name && customer.phone, customer.email].filter(Boolean).join(" · ") || undefined}
      />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href="/customers">
              <ArrowLeft />
              Customers
            </Link>
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Orders" value={String(stats.orders)} hint={stats.cancelled > 0 ? `${stats.cancelled} cancelled` : undefined} />
          <Stat label="Delivered" value={String(stats.delivered)} />
          <Stat label="Total spent" value={money(stats.totalSpent)} hint="Delivered orders only" />
          <Stat
            label="Last order"
            value={stats.lastOrderAt ? formatTimeAgo(stats.lastOrderAt) : "—"}
            hint={`Customer since ${formatDateTime(customer.createdAt, settings.timezone)}`}
          />
        </div>

        <div className="grid items-start gap-4 xl:grid-cols-5">
          <Card className="xl:col-span-3">
            <CardHeader>
              <CardTitle>Order history</CardTitle>
              <CardDescription>Every order this customer placed, newest first.</CardDescription>
            </CardHeader>
            <CardContent>
              {orders.items.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No orders yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead className="text-right">Total</TableHead>
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
                            {order.store.name} · {formatDateTime(order.createdAt, settings.timezone)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <OrderStatusBadge status={order.status} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{order.itemCount}</TableCell>
                        <TableCell className="text-right">
                          <div className="tabular-nums">{money(order.total)}</div>
                          <div className="text-xs text-muted-foreground">{PAYMENT_METHOD_LABELS[order.paymentMethod]}</div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {orders.total > PAGE_SIZE && (
                <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, orders.total)} of {orders.total}
                  </span>
                  <PaginationLinks page={page} lastPage={lastPage} href={pageHref} />
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Saved addresses</CardTitle>
              <CardDescription>Past orders keep the address they were placed with, even if the customer edits or deletes it.</CardDescription>
            </CardHeader>
            <CardContent>
              {customer.addresses.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">No saved addresses.</p>
              ) : (
                <ul className="divide-y">
                  {customer.addresses.map((address) => (
                    <AddressBlock key={address.id} address={address} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
