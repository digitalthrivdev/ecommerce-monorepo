import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Star } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PaginationLinks } from "@/components/pagination-links";
import { PageBody, Panel } from "@/components/section";
import { Stars } from "@/components/stars";
import { StoreFilter } from "@/components/store-filter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { getCurrentUser, getPublicSettings } from "@/lib/dal";
import { formatDate, formatDateTime, todayIn } from "@/lib/format";
import type { LowRating, Paginated, StoreDetails } from "@/lib/types";

export const metadata: Metadata = { title: "Low ratings" };

const PAGE_SIZE = 25;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const day = (value: string | undefined) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : undefined);

export default async function RatingsPage({ searchParams }: PageProps<"/ratings">) {
  const user = await getCurrentUser();
  const isAdmin = user.role === "ADMIN";
  const params = await searchParams;

  const storeId = isAdmin ? first(params.storeId) || undefined : undefined;
  let from = day(first(params.from));
  let to = day(first(params.to));
  if (from && to && from > to) [from, to] = [to, from];
  const page = Math.max(1, Number.parseInt(first(params.page) ?? "1", 10) || 1);

  const query = { from, to, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE };
  const [ratings, stores, settings] = await Promise.all([
    isAdmin
      ? apiFetch<Paginated<LowRating>>("/admin/ratings", { query: { ...query, storeId } })
      : apiFetch<Paginated<LowRating>>(`/stores/${encodeURIComponent(user.store!.id)}/ratings`, { query }),
    isAdmin ? apiFetch<Paginated<StoreDetails>>("/stores", { query: { includeInactive: true, limit: 100 } }) : null,
    getPublicSettings(),
  ]);

  const href = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ storeId, from, to, ...changes })) {
      if (value) next.set(key, value);
    }
    const search = next.toString();
    return search ? `/ratings?${search}` : "/ratings";
  };
  const lastPage = Math.max(1, Math.ceil(ratings.total / PAGE_SIZE));
  const today = todayIn(settings.timezone);
  const filtered = Boolean(from || to);
  const showStore = isAdmin && !storeId;

  return (
    <>
      <PageHeader
        title="Low ratings"
        description={`Orders customers rated 1 or 2 stars for the delivery or the items${isAdmin ? "" : ` at ${user.store?.name ?? "your store"}`}. Newest first.`}
        actions={stores && stores.items.length > 1 && <StoreFilter stores={stores.items} />}
      />
      <PageBody>
        <div className="flex flex-col gap-4">
          <Form action="/ratings" className="flex flex-wrap items-end gap-3">
            {storeId && <input type="hidden" name="storeId" value={storeId} />}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ratings-from">Rated from</Label>
              <Input id="ratings-from" name="from" type="date" defaultValue={from} max={today} className="w-40" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ratings-to">To</Label>
              <Input id="ratings-to" name="to" type="date" defaultValue={to} max={today} className="w-40" />
            </div>
            <Button type="submit" variant="outline">
              Filter
            </Button>
            {filtered && (
              <Button asChild variant="ghost">
                <Link href={href({ from: undefined, to: undefined, page: undefined })}>Clear dates</Link>
              </Button>
            )}
          </Form>

          {ratings.items.length === 0 ? (
            <EmptyState
              icon={Star}
              title={filtered ? "No low ratings in these dates" : "No low ratings"}
              description="Customers can rate a delivered order in the app for up to 7 days."
            />
          ) : (
            <Panel>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Delivery</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Comment</TableHead>
                    <TableHead>Rated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ratings.items.map((rating) => (
                    <TableRow key={rating.id}>
                      <TableCell>
                        <Link href={`/orders/${rating.order.id}`} className="font-medium underline-offset-4 hover:underline">
                          {rating.order.orderNumber}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {[showStore && rating.order.store.name, rating.order.customerName].filter(Boolean).join(" · ")}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Stars value={rating.deliveryRating} />
                      </TableCell>
                      <TableCell>{rating.itemsRating ? <Stars value={rating.itemsRating} /> : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="max-w-sm text-sm whitespace-normal">
                        {rating.comment ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTime(rating.createdAt, settings.timezone)}
                        {rating.order.deliveredAt && <div className="text-xs">Delivered {formatDate(rating.order.deliveredAt, settings.timezone)}</div>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>
          )}

          {ratings.total > PAGE_SIZE && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, ratings.total)} of {ratings.total}
              </span>
              <PaginationLinks page={page} lastPage={lastPage} href={(target) => href({ page: target > 1 ? String(target) : undefined })} />
            </div>
          )}
        </div>
      </PageBody>
    </>
  );
}
