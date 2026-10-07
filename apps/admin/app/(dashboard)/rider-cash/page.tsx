import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Search } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { PaginationLinks } from "@/components/pagination-links";
import { PartnerStatusBadge } from "@/components/partners/partner-status-badge";
import { RecordDepositDialog } from "@/components/rider-cash/record-deposit-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { getCurrentUser, getPublicSettings } from "@/lib/dal";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { RiderCashList } from "@/lib/types";

export const metadata: Metadata = { title: "Rider cash" };

const PAGE_SIZE = 25;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function RiderCashPage({ searchParams }: PageProps<"/rider-cash">) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const q = first(params.q)?.trim().slice(0, 50) || undefined;
  const page = Math.max(1, Number.parseInt(first(params.page) ?? "1", 10) || 1);

  const [riders, settings] = await Promise.all([
    apiFetch<RiderCashList>("/rider-cash", { query: { q, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE } }),
    getPublicSettings(),
  ]);
  const money = (amount: string) => formatMoney(amount, riders.currency);
  const limit = riders.cashLimit;
  const lastPage = Math.max(1, Math.ceil(riders.total / PAGE_SIZE));
  const href = (target: number) => {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (target > 1) next.set("page", String(target));
    const query = next.toString();
    return query ? `/rider-cash?${query}` : "/rider-cash";
  };

  return (
    <>
      <PageHeader title="Rider cash" description="Cash riders collected on delivery and haven't handed over yet" />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <Card size="sm" className="lg:min-w-72">
            <CardHeader>
              <CardDescription>{q ? "Cash with matching riders" : "Cash with all riders"}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{money(riders.totalInHand)}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {limit
                  ? `Riders holding ${money(limit)} or more get no new orders.`
                  : user.role === "ADMIN"
                    ? "No cash limit is set. You can set one in Settings."
                    : "No cash limit is set."}
              </p>
            </CardHeader>
          </Card>

          <Form action="/rider-cash" className="flex gap-2">
            <Input name="q" type="search" defaultValue={q} maxLength={50} placeholder="Name or phone" aria-label="Search riders" className="w-64" />
            <Button type="submit" variant="outline" size="icon" aria-label="Search">
              <Search />
            </Button>
          </Form>
        </div>

        <Card>
          <CardContent>
            {riders.items.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">{q ? `No riders match “${q}”.` : "No riders yet."}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rider</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Cash in hand</TableHead>
                    <TableHead>Last deposit</TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {riders.items.map((rider) => (
                    <TableRow key={rider.id}>
                      <TableCell>
                        <Link href={`/rider-cash/${rider.id}`} className="font-medium underline-offset-4 hover:underline">
                          {rider.name ?? rider.phone}
                        </Link>
                        <div className="text-xs text-muted-foreground">{rider.phone}</div>
                      </TableCell>
                      <TableCell>
                        <PartnerStatusBadge partner={rider} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="font-medium tabular-nums">{money(rider.cash.inHand)}</div>
                        {rider.cash.limitReached && (
                          <Badge variant="destructive" className="mt-1">
                            Limit reached
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {rider.lastDepositAt ? formatDateTime(rider.lastDepositAt, settings.timezone) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <RecordDepositDialog
                          partnerId={rider.id}
                          riderName={rider.name ?? rider.phone}
                          inHand={rider.cash.inHand}
                          currency={riders.currency}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {riders.total > PAGE_SIZE && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, riders.total)} of {riders.total}
            </span>
            <PaginationLinks page={page} lastPage={lastPage} href={href} />
          </div>
        )}
      </div>
    </>
  );
}
