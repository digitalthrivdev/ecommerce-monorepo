import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquareText } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PaginationLinks } from "@/components/pagination-links";
import { ReviewVisibilityButton } from "@/components/review-visibility-button";
import { PageBody, Panel } from "@/components/section";
import { Stars } from "@/components/stars";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { getPublicSettings, requireAdmin } from "@/lib/dal";
import { formatDateTime } from "@/lib/format";
import type { Paginated, ProductReview } from "@/lib/types";

export const metadata: Metadata = { title: "Product reviews" };

const PAGE_SIZE = 25;
const STAR_FILTERS = ["5", "4", "3", "2", "1"] as const;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function ReviewsPage({ searchParams }: PageProps<"/reviews">) {
  await requireAdmin();
  const params = await searchParams;

  const rating = STAR_FILTERS.find((stars) => stars === first(params.rating));
  const hidden = first(params.hidden) === "true" ? "true" : undefined;
  const page = Math.max(1, Number.parseInt(first(params.page) ?? "1", 10) || 1);

  const [reviews, settings] = await Promise.all([
    apiFetch<Paginated<ProductReview>>("/admin/reviews", { query: { rating, hidden, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE } }),
    getPublicSettings(),
  ]);

  const href = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ rating, hidden, ...changes })) {
      if (value) next.set(key, value);
    }
    const search = next.toString();
    return search ? `/reviews?${search}` : "/reviews";
  };
  const filter = (label: string, active: boolean, changes: Record<string, string | undefined>) => (
    <Button key={label} asChild size="sm" variant={active ? "secondary" : "ghost"}>
      <Link href={href({ ...changes, page: undefined })}>{label}</Link>
    </Button>
  );
  const lastPage = Math.max(1, Math.ceil(reviews.total / PAGE_SIZE));
  const filtered = Boolean(rating || hidden);

  return (
    <>
      <PageHeader
        title="Product reviews"
        description="Ratings customers gave products from their delivered orders. Hide a review to remove it from the app and the product's rating."
      />
      <PageBody>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-1">
            {filter("All", !hidden, { hidden: undefined })}
            {filter("Hidden", Boolean(hidden), { hidden: "true" })}
            <span className="mx-2 h-5 w-px bg-border" aria-hidden />
            {filter("Any rating", !rating, { rating: undefined })}
            {STAR_FILTERS.map((stars) => filter(`${stars} ★`, rating === stars, { rating: stars }))}
          </div>

          {reviews.items.length === 0 ? (
            <EmptyState
              icon={MessageSquareText}
              title={filtered ? "No reviews match these filters" : "No reviews yet"}
              description="Customers can rate each product on a delivered order in the app."
            />
          ) : (
            <Panel>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Rating</TableHead>
                    <TableHead>Review</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">Visibility</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reviews.items.map((review) => (
                    <TableRow key={review.id} className={review.isHidden ? "opacity-60" : undefined}>
                      <TableCell className="max-w-56 whitespace-normal">
                        <Link href={`/products/${review.product.id}`} className="font-medium underline-offset-4 hover:underline">
                          {review.product.name}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          <Link href={`/orders/${review.order.id}`} className="underline-offset-4 hover:underline">
                            Order {review.order.orderNumber}
                          </Link>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Stars value={review.rating} />
                        {review.isHidden && (
                          <Badge variant="outline" className="mt-1">
                            Hidden
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="max-w-sm text-sm whitespace-normal">{review.comment ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        <Link href={`/customers/${review.customer.id}`} className="underline-offset-4 hover:underline">
                          {review.customer.name ?? review.customer.phone ?? "Deleted account"}
                        </Link>
                        {review.customer.name && review.customer.phone && <div className="text-xs text-muted-foreground">{review.customer.phone}</div>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDateTime(review.updatedAt, settings.timezone)}</TableCell>
                      <TableCell className="text-right">
                        <ReviewVisibilityButton id={review.id} isHidden={review.isHidden} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>
          )}

          {reviews.total > PAGE_SIZE && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, reviews.total)} of {reviews.total}
              </span>
              <PaginationLinks page={page} lastPage={lastPage} href={(target) => href({ page: target > 1 ? String(target) : undefined })} />
            </div>
          )}
        </div>
      </PageBody>
    </>
  );
}
