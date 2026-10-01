import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Search } from "lucide-react";

import { AutoRefresh } from "@/components/auto-refresh";
import { PageHeader } from "@/components/page-header";
import { PaginationLinks } from "@/components/pagination-links";
import { AddPartnerDialog } from "@/components/partners/add-partner-dialog";
import { PartnerStatusBadge } from "@/components/partners/partner-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { requireAdmin } from "@/lib/dal";
import { formatTimeAgo, ORDER_STATUS_LABELS } from "@/lib/format";
import type { DeliveryPartnerStatus, PartnerList } from "@/lib/types";

export const metadata: Metadata = { title: "Delivery partners" };

const PAGE_SIZE = 25;

type CountKey = keyof PartnerList["counts"];
type Tab = { id: CountKey; label: string; status?: DeliveryPartnerStatus; isActive?: boolean };

const TABS: Tab[] = [
  { id: "all", label: "All" },
  { id: "online", label: "Available", status: "ONLINE", isActive: true },
  { id: "busy", label: "On a delivery", status: "BUSY", isActive: true },
  { id: "offline", label: "Offline", status: "OFFLINE", isActive: true },
  { id: "inactive", label: "Deactivated", isActive: false },
];

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function DeliveryPartnersPage({ searchParams }: PageProps<"/delivery-partners">) {
  await requireAdmin();
  const params = await searchParams;

  const tab = TABS.find((candidate) => candidate.id === first(params.tab)) ?? TABS[0]!;
  const q = first(params.q)?.trim().slice(0, 50) || undefined;
  const page = Math.max(1, Number.parseInt(first(params.page) ?? "1", 10) || 1);

  const partners = await apiFetch<PartnerList>("/delivery-partners", {
    query: { status: tab.status, isActive: tab.isActive, q, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
  });

  const href = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ tab: tab.id, q, ...changes })) {
      if (value && !(key === "tab" && value === "all")) next.set(key, value);
    }
    const query = next.toString();
    return query ? `/delivery-partners?${query}` : "/delivery-partners";
  };
  const lastPage = Math.max(1, Math.ceil(partners.total / PAGE_SIZE));

  return (
    <>
      <AutoRefresh seconds={30} />
      <PageHeader title="Delivery partners" description="Who is available, who is out on a delivery, and who is offline" actions={<AddPartnerDialog />} />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <nav aria-label="Partner status" className="flex flex-wrap gap-1">
            {TABS.map((candidate) => {
              const active = candidate.id === tab.id;
              const count = partners.counts[candidate.id];
              return (
                <Button key={candidate.id} asChild size="sm" variant={active ? "secondary" : "ghost"}>
                  <Link href={href({ tab: candidate.id })} aria-current={active ? "page" : undefined}>
                    {candidate.label}
                    {count > 0 && (
                      <Badge variant="outline" className="ml-1 tabular-nums">
                        {count}
                      </Badge>
                    )}
                  </Link>
                </Button>
              );
            })}
          </nav>

          <Form action="/delivery-partners" className="flex gap-2">
            {tab.id !== "all" && <input type="hidden" name="tab" value={tab.id} />}
            <Input name="q" type="search" defaultValue={q} maxLength={50} placeholder="Name or phone" aria-label="Search partners" className="w-64" />
            <Button type="submit" variant="outline" size="icon" aria-label="Search">
              <Search />
            </Button>
          </Form>
        </div>

        <Card>
          <CardContent>
            {partners.items.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {q ? `No partners match “${q}”.` : partners.counts.all === 0 ? "No delivery partners yet. Add one to start assigning orders." : "No partners here right now."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Partner</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Current delivery</TableHead>
                    <TableHead>Location</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partners.items.map((partner) => (
                    <TableRow key={partner.id}>
                      <TableCell>
                        <Link href={`/delivery-partners/${partner.id}`} className="font-medium underline-offset-4 hover:underline">
                          {partner.name ?? partner.phone}
                        </Link>
                        <div className="text-xs text-muted-foreground">{partner.phone}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {[partner.vehicleType, partner.vehicleNumber].filter(Boolean).join(" · ") || "—"}
                      </TableCell>
                      <TableCell>
                        <PartnerStatusBadge partner={partner} />
                      </TableCell>
                      <TableCell>
                        {partner.activeDelivery ? (
                          <>
                            <Link href={`/orders/${partner.activeDelivery.orderId}`} className="underline-offset-4 hover:underline">
                              {partner.activeDelivery.orderNumber}
                            </Link>
                            <div className="text-xs text-muted-foreground">
                              {partner.activeDelivery.accepted ? ORDER_STATUS_LABELS[partner.activeDelivery.orderStatus] : "Not accepted yet"}
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {partner.lastLocation ? (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${partner.lastLocation.latitude},${partner.lastLocation.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline-offset-4 hover:underline"
                          >
                            {formatTimeAgo(partner.lastLocation.updatedAt)}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">No recent location</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {partners.total > PAGE_SIZE && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, partners.total)} of {partners.total}
            </span>
            <PaginationLinks page={page} lastPage={lastPage} href={(target) => href({ page: String(target) })} />
          </div>
        )}
      </div>
    </>
  );
}
