import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { PaginationLinks } from "@/components/pagination-links";
import { PartnerStatusBadge } from "@/components/partners/partner-status-badge";
import { RecordDepositDialog } from "@/components/rider-cash/record-deposit-dialog";
import { VoidDepositDialog } from "@/components/rider-cash/void-deposit-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, apiFetch } from "@/lib/api";
import { getCurrentUser, getPublicSettings } from "@/lib/dal";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { CashDeposit, Paginated, RiderCashDetails } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Rider cash" };

const PAGE_SIZE = 20;

async function getRider(id: string) {
  try {
    return await apiFetch<RiderCashDetails>(`/rider-cash/${encodeURIComponent(id)}`);
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

export default async function RiderCashDetailsPage({ params, searchParams }: PageProps<"/rider-cash/[partnerId]">) {
  const user = await getCurrentUser();
  const { partnerId } = await params;
  const pageParam = (await searchParams).page;
  const page = Math.max(1, Number.parseInt((Array.isArray(pageParam) ? pageParam[0] : pageParam) ?? "1", 10) || 1);

  const rider = await getRider(partnerId);
  const [deposits, settings] = await Promise.all([
    apiFetch<Paginated<CashDeposit>>(`/rider-cash/${encodeURIComponent(rider.id)}/deposits`, {
      query: { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
    }),
    getPublicSettings(),
  ]);
  const { cash } = rider;
  const money = (amount: string) => formatMoney(amount, cash.currency);
  const name = rider.name ?? rider.phone;
  const lastPage = Math.max(1, Math.ceil(deposits.total / PAGE_SIZE));
  const pageHref = (target: number) => (target > 1 ? `/rider-cash/${rider.id}?page=${target}` : `/rider-cash/${rider.id}`);
  const since = formatDateTime(rider.cashSince, settings.timezone);

  return (
    <>
      <PageHeader
        back={{ href: "/rider-cash", label: "Rider cash" }}
        title={name}
        description={rider.phone}
        status={<PartnerStatusBadge partner={rider} />}
        actions={<RecordDepositDialog partnerId={rider.id} riderName={name} inHand={cash.inHand} currency={cash.currency} size="default" />}
      />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat
            label="Cash in hand"
            value={money(cash.inHand)}
            hint={
              cash.limit
                ? cash.limitReached
                  ? `At the ${money(cash.limit)} limit: no new orders until they deposit`
                  : `Limit ${money(cash.limit)}`
                : undefined
            }
          />
          <Stat label="Collected on delivery" value={money(cash.collected)} hint={`Cash orders delivered since ${since}`} />
          <Stat label="Deposited" value={money(cash.deposited)} hint="Voided deposits not included" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Deposits</CardTitle>
            <CardDescription>Cash this rider handed over, newest first.</CardDescription>
          </CardHeader>
          <CardContent>
            {deposits.items.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No deposits yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Received by</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    {user.role === "ADMIN" && (
                      <TableHead className="text-right">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deposits.items.map((deposit) => (
                    <TableRow key={deposit.id} className={cn(deposit.voided && "text-muted-foreground")}>
                      <TableCell>{formatDateTime(deposit.createdAt, settings.timezone)}</TableCell>
                      <TableCell>
                        {deposit.recordedBy ?? "—"}
                        <div className="text-xs text-muted-foreground">{deposit.store?.name ?? "Admin"}</div>
                      </TableCell>
                      <TableCell>
                        {deposit.note ?? "—"}
                        {deposit.voided && (
                          <div className="text-xs">
                            Voided {formatDateTime(deposit.voided.at, settings.timezone)}
                            {deposit.voided.by && ` by ${deposit.voided.by}`}: {deposit.voided.reason}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={cn("tabular-nums", deposit.voided && "line-through")}>{money(deposit.amount)}</span>
                        {deposit.voided && (
                          <Badge variant="outline" className="ml-2">
                            Voided
                          </Badge>
                        )}
                      </TableCell>
                      {user.role === "ADMIN" && (
                        <TableCell className="text-right">
                          {!deposit.voided && <VoidDepositDialog depositId={deposit.id} amount={money(deposit.amount)} />}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {deposits.total > PAGE_SIZE && (
              <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, deposits.total)} of {deposits.total}
                </span>
                <PaginationLinks page={page} lastPage={lastPage} href={pageHref} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
