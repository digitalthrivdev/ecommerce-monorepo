import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { PaginationLinks } from "@/components/pagination-links";
import { PartnerForm } from "@/components/partners/partner-form";
import { PartnerStatusBadge } from "@/components/partners/partner-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, apiFetch } from "@/lib/api";
import { getPublicSettings, requireAdmin } from "@/lib/dal";
import { DELIVERY_STATUS_LABELS, formatDateTime, formatMoney, formatTimeAgo, PAYMENT_METHOD_LABELS } from "@/lib/format";
import type { DeliveryPartnerDetails, Paginated, PartnerDelivery } from "@/lib/types";

export const metadata: Metadata = { title: "Delivery partner" };

const PAGE_SIZE = 20;

async function getPartner(id: string) {
  try {
    return await apiFetch<DeliveryPartnerDetails>(`/delivery-partners/${encodeURIComponent(id)}`);
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

export default async function PartnerPage({ params, searchParams }: PageProps<"/delivery-partners/[partnerId]">) {
  await requireAdmin();
  const { partnerId } = await params;
  const pageParam = (await searchParams).page;
  const page = Math.max(1, Number.parseInt((Array.isArray(pageParam) ? pageParam[0] : pageParam) ?? "1", 10) || 1);

  const partner = await getPartner(partnerId);
  const [deliveries, settings] = await Promise.all([
    apiFetch<Paginated<PartnerDelivery>>(`/delivery-partners/${encodeURIComponent(partner.id)}/deliveries`, {
      query: { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
    }),
    getPublicSettings(),
  ]);
  const money = (amount: string) => formatMoney(amount, settings.currency);
  const lastPage = Math.max(1, Math.ceil(deliveries.total / PAGE_SIZE));
  const pageHref = (target: number) => (target > 1 ? `/delivery-partners/${partner.id}?page=${target}` : `/delivery-partners/${partner.id}`);
  const { today, allTime } = partner.stats;
  const vehicle = [partner.vehicleType, partner.vehicleNumber].filter(Boolean).join(" · ");

  return (
    <>
      <PageHeader
        title={partner.name ?? partner.phone}
        description={[partner.phone, vehicle].filter(Boolean).join(" · ")}
        actions={<PartnerStatusBadge partner={partner} />}
      />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href="/delivery-partners">
              <ArrowLeft />
              Delivery partners
            </Link>
          </Button>
          <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
            {partner.activeDelivery && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/orders/${partner.activeDelivery.orderId}`}>
                  Delivering {partner.activeDelivery.orderNumber}
                  {!partner.activeDelivery.accepted && " (not accepted yet)"}
                </Link>
              </Button>
            )}
            {partner.lastLocation ? (
              <Button asChild variant="outline" size="sm">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${partner.lastLocation.latitude},${partner.lastLocation.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink />
                  Location {formatTimeAgo(partner.lastLocation.updatedAt)}
                </a>
              </Button>
            ) : (
              <span className="text-muted-foreground">No recent location</span>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Delivered today" value={String(today.deliveries)} />
          <Stat label="Earned today" value={money(today.earnings)} />
          <Stat label="Cash collected today" value={money(today.cashCollected)} hint="Cash on delivery orders to hand over" />
          <Stat label="Delivered all time" value={String(allTime.deliveries)} hint={`${money(allTime.earnings)} earned`} />
        </div>

        <div className="grid items-start gap-4 xl:grid-cols-5">
          <Card className="xl:col-span-3">
            <CardHeader>
              <CardTitle>Deliveries</CardTitle>
              <CardDescription>
                Orders this partner delivered or is delivering, newest first. Declined or reassigned orders move to the new partner.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {deliveries.items.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No deliveries yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Order total</TableHead>
                      <TableHead className="text-right">Earning</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deliveries.items.map((delivery) => (
                      <TableRow key={delivery.id}>
                        <TableCell>
                          <Link href={`/orders/${delivery.order.id}`} className="font-medium underline-offset-4 hover:underline">
                            {delivery.order.orderNumber}
                          </Link>
                          <div className="text-xs text-muted-foreground">
                            {delivery.order.store.name}
                            {delivery.assignedAt && ` · ${formatDateTime(delivery.assignedAt, settings.timezone)}`}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={delivery.status === "DELIVERED" ? "secondary" : delivery.status === "CANCELLED" ? "destructive" : "outline"}>
                            {DELIVERY_STATUS_LABELS[delivery.status]}
                          </Badge>
                          {delivery.deliveredAt && (
                            <div className="text-xs text-muted-foreground">{formatDateTime(delivery.deliveredAt, settings.timezone)}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="tabular-nums">{money(delivery.order.total)}</div>
                          <div className="text-xs text-muted-foreground">{PAYMENT_METHOD_LABELS[delivery.order.paymentMethod]}</div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{delivery.earning ? money(delivery.earning) : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {deliveries.total > PAGE_SIZE && (
                <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, deliveries.total)} of {deliveries.total}
                  </span>
                  <PaginationLinks page={page} lastPage={lastPage} href={pageHref} />
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <PartnerForm partner={partner} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
