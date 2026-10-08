import type { Metadata } from "next";
import Form from "next/form";
import { Search } from "lucide-react";

import { CouponDialog } from "@/components/coupon-dialog";
import { PageHeader } from "@/components/page-header";
import { PaginationLinks } from "@/components/pagination-links";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { getPublicSettings, requireAdmin } from "@/lib/dal";
import { formatDay, formatMoney, formatNumber } from "@/lib/format";
import type { Coupon, CouponStatus, Paginated } from "@/lib/types";

export const metadata: Metadata = { title: "Coupons" };

const PAGE_SIZE = 25;

const STATUS: Record<CouponStatus, { label: string; variant: "default" | "secondary" | "outline" }> = {
  ACTIVE: { label: "Active", variant: "default" },
  SCHEDULED: { label: "Scheduled", variant: "secondary" },
  EXPIRED: { label: "Expired", variant: "outline" },
  USED_UP: { label: "Used up", variant: "outline" },
  INACTIVE: { label: "Switched off", variant: "outline" },
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function discountText(coupon: Coupon, currency: string) {
  if (coupon.discountType === "FLAT") return `${formatMoney(coupon.discountValue, currency)} off`;
  const percent = `${Number(coupon.discountValue)}% off`;
  return coupon.maxDiscount ? `${percent}, up to ${formatMoney(coupon.maxDiscount, currency)}` : percent;
}

function datesText(coupon: Coupon) {
  if (coupon.startsOn && coupon.endsOn) return `${formatDay(coupon.startsOn)} – ${formatDay(coupon.endsOn)}`;
  if (coupon.startsOn) return `From ${formatDay(coupon.startsOn)}`;
  if (coupon.endsOn) return `Until ${formatDay(coupon.endsOn)}`;
  return "No end date";
}

export default async function CouponsPage({ searchParams }: PageProps<"/coupons">) {
  await requireAdmin();
  const params = await searchParams;
  const q = first(params.q)?.trim().slice(0, 40) || undefined;
  const page = Math.max(1, Number.parseInt(first(params.page) ?? "1", 10) || 1);

  const [coupons, { currency }] = await Promise.all([
    apiFetch<Paginated<Coupon>>("/admin/coupons", { query: { q, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE } }),
    getPublicSettings(),
  ]);
  const lastPage = Math.max(1, Math.ceil(coupons.total / PAGE_SIZE));
  const href = (target: number) => {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (target > 1) next.set("page", String(target));
    const query = next.toString();
    return query ? `/coupons?${query}` : "/coupons";
  };

  return (
    <>
      <PageHeader
        title="Coupons"
        description="Codes customers enter at checkout for a discount"
        actions={<CouponDialog currency={currency} />}
      />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        <Form action="/coupons" className="flex gap-2 self-end">
          <Input name="q" type="search" defaultValue={q} maxLength={40} placeholder="Code" aria-label="Search coupons" className="w-64" />
          <Button type="submit" variant="outline" size="icon" aria-label="Search">
            <Search />
          </Button>
        </Form>

        <Card>
          <CardContent>
            {coupons.items.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">{q ? "No coupons match this code." : "No coupons yet."}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Discount</TableHead>
                    <TableHead>Conditions</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead className="text-right">Used</TableHead>
                    <TableHead className="text-right">Discount given</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">Edit</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coupons.items.map((coupon) => {
                    const conditions = [
                      Number(coupon.minOrderValue) > 0 && `Min. ${formatMoney(coupon.minOrderValue, currency)}`,
                      coupon.perCustomerLimit && `${coupon.perCustomerLimit} per customer`,
                      coupon.firstOrderOnly && "First order only",
                    ].filter(Boolean);
                    return (
                      <TableRow key={coupon.id}>
                        <TableCell>
                          <div className="font-mono font-medium">{coupon.code}</div>
                          {coupon.description && <div className="max-w-56 truncate text-xs text-muted-foreground">{coupon.description}</div>}
                        </TableCell>
                        <TableCell>{discountText(coupon, currency)}</TableCell>
                        <TableCell className="text-muted-foreground">{conditions.length > 0 ? conditions.join(" · ") : "None"}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{datesText(coupon)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(coupon.usedCount)}
                          {coupon.totalLimit && <span className="text-muted-foreground"> / {formatNumber(coupon.totalLimit)}</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(coupon.discountGiven, currency)}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS[coupon.status].variant}>{STATUS[coupon.status].label}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <CouponDialog coupon={coupon} currency={currency} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Used counts orders that weren&apos;t cancelled; discount given counts delivered orders.</p>
          {lastPage > 1 && <PaginationLinks page={page} lastPage={lastPage} href={href} />}
        </div>
      </div>
    </>
  );
}
