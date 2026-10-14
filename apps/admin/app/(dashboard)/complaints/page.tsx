import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { MessageSquareWarning, Search } from "lucide-react";

import { ComplaintStatusPill } from "@/components/complaints/complaint-status-pill";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PageTabs } from "@/components/page-tabs";
import { PaginationLinks } from "@/components/pagination-links";
import { PageBody, Panel } from "@/components/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { getPublicSettings, requireAdmin } from "@/lib/dal";
import { COMPLAINT_REASON_LABELS, formatMoney, formatTimeAgo } from "@/lib/format";
import type { ComplaintList, ComplaintStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Complaints" };

const PAGE_SIZE = 25;

const TABS: { id: string; label: string; status?: ComplaintStatus }[] = [
  { id: "open", label: "Open", status: "OPEN" },
  { id: "resolved", label: "Resolved", status: "RESOLVED" },
  { id: "rejected", label: "Rejected", status: "REJECTED" },
  { id: "all", label: "All" },
];

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function ComplaintsPage({ searchParams }: PageProps<"/complaints">) {
  await requireAdmin();
  const params = await searchParams;

  const q = first(params.q)?.trim().slice(0, 50) || undefined;
  const tab = TABS.find((candidate) => candidate.id === first(params.tab)) ?? (q ? TABS.at(-1)! : TABS[0]!);
  const page = Math.max(1, Number.parseInt(first(params.page) ?? "1", 10) || 1);

  const [complaints, settings] = await Promise.all([
    apiFetch<ComplaintList>("/admin/complaints", {
      query: { status: tab.status, q, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
    }),
    getPublicSettings(),
  ]);

  const href = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ tab: tab.id, q, ...changes })) {
      if (value) next.set(key, value);
    }
    const query = next.toString();
    return query ? `/complaints?${query}` : "/complaints";
  };
  const lastPage = Math.max(1, Math.ceil(complaints.total / PAGE_SIZE));
  const money = (amount: string) => formatMoney(amount, settings.currency);

  return (
    <>
      <PageHeader title="Complaints" description="Problems customers reported with delivered orders. Open ones are oldest first." />
      <PageBody>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <PageTabs
              label="Complaint status"
              active={tab.id}
              tabs={TABS.map((candidate) => ({
                id: candidate.id,
                label: candidate.label,
                href: href({ tab: candidate.id, page: undefined }),
                badge:
                  candidate.status && complaints.statusCounts[candidate.status] ? (
                    <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{complaints.statusCounts[candidate.status]}</span>
                  ) : undefined,
              }))}
            />
            <Form action="/complaints" className="flex gap-2">
              <input type="hidden" name="tab" value={tab.id} />
              <Input name="q" type="search" defaultValue={q} maxLength={50} placeholder="Order number, name or phone" aria-label="Search complaints" className="w-64" />
              <Button type="submit" variant="outline" size="icon" aria-label="Search">
                <Search />
              </Button>
            </Form>
          </div>

          {complaints.items.length === 0 ? (
            <EmptyState
              icon={MessageSquareWarning}
              title={q ? `No complaints match “${q}”` : tab.status === "OPEN" ? "No open complaints" : "No complaints here"}
              description={tab.status === "OPEN" && !q ? "Customers can report a problem from a delivered order in the app, for up to 24 hours." : undefined}
            />
          ) : (
            <Panel>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Problem</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Refunded</TableHead>
                    <TableHead>Reported</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {complaints.items.map((complaint) => (
                    <TableRow key={complaint.id}>
                      <TableCell>
                        <Link href={`/complaints/${complaint.id}`} className="font-medium underline-offset-4 hover:underline">
                          {complaint.order.orderNumber}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {complaint.order.paymentMethod === "COD" ? "Cash" : "Online"} {money(complaint.order.total)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {complaint.order.customerName}
                        <div className="text-xs text-muted-foreground tabular-nums">{complaint.order.customerPhone}</div>
                      </TableCell>
                      <TableCell>
                        {COMPLAINT_REASON_LABELS[complaint.reason]}
                        <div className="text-xs text-muted-foreground">
                          {complaint.itemCount} {complaint.itemCount === 1 ? "item" : "items"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <ComplaintStatusPill status={complaint.status} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{Number(complaint.refunded) > 0 ? money(complaint.refunded) : "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{formatTimeAgo(complaint.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>
          )}

          {complaints.total > PAGE_SIZE && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, complaints.total)} of {complaints.total}
              </span>
              <PaginationLinks page={page} lastPage={lastPage} href={(target) => href({ page: target > 1 ? String(target) : undefined })} />
            </div>
          )}
        </div>
      </PageBody>
    </>
  );
}
