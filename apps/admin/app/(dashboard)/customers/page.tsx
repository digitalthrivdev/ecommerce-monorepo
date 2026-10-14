import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Search } from "lucide-react";

import { OrderStatusPill } from "@/components/status-pill";
import { PageHeader } from "@/components/page-header";
import { PageTabs } from "@/components/page-tabs";
import { PaginationLinks } from "@/components/pagination-links";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { getPublicSettings, requireAdmin } from "@/lib/dal";
import { CUSTOMER_BLOCK_LABELS, formatDateTime, formatMoney, formatNumber, formatTimeAgo, personName } from "@/lib/format";
import type { CustomerListItem, Paginated } from "@/lib/types";

export const metadata: Metadata = { title: "Customers" };

const PAGE_SIZE = 25;
const TABS: { id: string; label: string; filter?: "blocked"; empty: string }[] = [
  { id: "all", label: "All", empty: "No customers yet. They appear here after signing in to the app." },
  { id: "blocked", label: "Blocked", filter: "blocked", empty: "No customer is blocked." },
];

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  await requireAdmin();
  const params = await searchParams;

  const q = first(params.q)?.trim().slice(0, 50) || undefined;
  const tab = TABS.find((candidate) => candidate.id === first(params.tab)) ?? TABS[0]!;
  const page = Math.max(1, Number.parseInt(first(params.page) ?? "1", 10) || 1);

  const [customers, settings] = await Promise.all([
    apiFetch<Paginated<CustomerListItem>>("/admin/customers", {
      query: { q, filter: tab.filter, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
    }),
    getPublicSettings(),
  ]);

  const href = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ tab: tab.filter ? tab.id : undefined, q, ...changes })) {
      if (value) next.set(key, value);
    }
    const query = next.toString();
    return query ? `/customers?${query}` : "/customers";
  };
  const lastPage = Math.max(1, Math.ceil(customers.total / PAGE_SIZE));

  return (
    <>
      <PageHeader title="Customers" description="Registered customers, newest first, with their order activity" />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            <PageTabs
              label="Customer filter"
              active={tab.id}
              tabs={TABS.map((candidate) => ({ id: candidate.id, label: candidate.label, href: href({ tab: candidate.filter ? candidate.id : undefined, page: undefined }) }))}
            />
            <p className="text-sm text-muted-foreground">
              {q ? `${formatNumber(customers.total)} matching “${q}”` : `${formatNumber(customers.total)} customers`}
            </p>
          </div>
          <Form action="/customers" className="flex gap-2">
            {tab.filter && <input type="hidden" name="tab" value={tab.id} />}
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
                {q ? `No customers match “${q}”.` : tab.empty}
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
                          {personName(customer)}
                        </Link>
                        {customer.name && !customer.deletedAt && <div className="text-xs text-muted-foreground">{customer.phone}</div>}
                        {customer.orderBlock && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            <Badge variant="destructive">{CUSTOMER_BLOCK_LABELS[customer.orderBlock]}</Badge>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{customer.email ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{customer.orderCount}</TableCell>
                      <TableCell>
                        {customer.lastOrder ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <Link href={`/orders/${customer.lastOrder.id}`} className="underline-offset-4 hover:underline">
                              {customer.lastOrder.orderNumber}
                            </Link>
                            <OrderStatusPill status={customer.lastOrder.status} />
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
            <PaginationLinks page={page} lastPage={lastPage} href={(target) => href({ page: target > 1 ? String(target) : undefined })} />
          </div>
        )}
      </div>
    </>
  );
}
