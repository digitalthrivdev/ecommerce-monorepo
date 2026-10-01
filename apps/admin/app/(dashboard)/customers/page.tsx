import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Search } from "lucide-react";

import { OrderStatusBadge } from "@/components/order-status-badge";
import { PageHeader } from "@/components/page-header";
import { PaginationLinks } from "@/components/pagination-links";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { getPublicSettings, requireAdmin } from "@/lib/dal";
import { formatDateTime, formatMoney, formatNumber, formatTimeAgo } from "@/lib/format";
import type { CustomerListItem, Paginated } from "@/lib/types";

export const metadata: Metadata = { title: "Customers" };

const PAGE_SIZE = 25;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  await requireAdmin();
  const params = await searchParams;

  const q = first(params.q)?.trim().slice(0, 50) || undefined;
  const page = Math.max(1, Number.parseInt(first(params.page) ?? "1", 10) || 1);

  const [customers, settings] = await Promise.all([
    apiFetch<Paginated<CustomerListItem>>("/admin/customers", {
      query: { q, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
    }),
    getPublicSettings(),
  ]);

  const href = (target: number) => {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (target > 1) next.set("page", String(target));
    const query = next.toString();
    return query ? `/customers?${query}` : "/customers";
  };
  const lastPage = Math.max(1, Math.ceil(customers.total / PAGE_SIZE));

  return (
    <>
      <PageHeader title="Customers" description="Registered customers, newest first, with their order activity" />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {q ? `${formatNumber(customers.total)} matching “${q}”` : `${formatNumber(customers.total)} customers`}
          </p>
          <Form action="/customers" className="flex gap-2">
            <Input name="q" type="search" defaultValue={q} maxLength={50} placeholder="Name, phone or email" aria-label="Search customers" className="w-64" />
            <Button type="submit" variant="outline" size="icon" aria-label="Search">
              <Search />
            </Button>
          </Form>
        </div>

        <Card>
          <CardContent>
            {customers.items.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {q ? `No customers match “${q}”.` : "No customers yet. They appear here after signing in to the app."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead>Last order</TableHead>
                    <TableHead>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.items.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell>
                        <Link href={`/customers/${customer.id}`} className="font-medium underline-offset-4 hover:underline">
                          {customer.name ?? customer.phone}
                        </Link>
                        {customer.name && <div className="text-xs text-muted-foreground">{customer.phone}</div>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{customer.email ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{customer.orderCount}</TableCell>
                      <TableCell>
                        {customer.lastOrder ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <Link href={`/orders/${customer.lastOrder.id}`} className="underline-offset-4 hover:underline">
                              {customer.lastOrder.orderNumber}
                            </Link>
                            <OrderStatusBadge status={customer.lastOrder.status} />
                            <span className="w-full text-xs text-muted-foreground">
                              {formatMoney(customer.lastOrder.total, settings.currency)} · {formatTimeAgo(customer.lastOrder.createdAt)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">No orders yet</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDateTime(customer.createdAt, settings.timezone)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {customers.total > PAGE_SIZE && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, customers.total)} of {customers.total}
            </span>
            <PaginationLinks page={page} lastPage={lastPage} href={href} />
          </div>
        )}
      </div>
    </>
  );
}
