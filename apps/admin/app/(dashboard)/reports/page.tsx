import type { Metadata } from "next";
import { Download } from "lucide-react";

import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { PageBody, Panel, Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import { getPublicSettings, requireAdmin } from "@/lib/dal";
import { todayIn } from "@/lib/format";
import type { Paginated, StoreDetails } from "@/lib/types";

export const metadata: Metadata = { title: "Reports" };

const REPORTS = [
  {
    id: "daily-sales",
    title: "Daily sales",
    description: "One line per day: orders delivered, item sales, coupon discounts, delivery charges, GST, and cash versus online.",
  },
  {
    id: "gst-summary",
    title: "GST summary",
    description: "Taxable value with CGST, SGST and IGST by HSN code and GST rate, including delivery charges. For your GST return.",
  },
  {
    id: "payments",
    title: "Online payments and refunds",
    description: "Every online payment received and every refund paid, with the gateway reference, to match your settlements.",
  },
] as const;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const day = (value: string | undefined) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : undefined);

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  await requireAdmin();
  const params = await searchParams;
  const [settings, stores] = await Promise.all([
    getPublicSettings(),
    apiFetch<Paginated<StoreDetails>>("/stores", { query: { includeInactive: true, limit: 100 } }),
  ]);

  const today = todayIn(settings.timezone);
  const from = day(first(params.from)) ?? `${today.slice(0, 8)}01`;
  const to = day(first(params.to)) ?? today;
  const storeId = first(params.storeId);
  const error = first(params.error);

  return (
    <>
      <PageHeader title="Reports" description={`Spreadsheets (CSV) for your accountant. Days are in ${settings.timezone}.`} />
      <PageBody narrow className="max-w-3xl gap-6">
        {error && (
          <Notice tone="danger" title="Could not make the report">
            {error}
          </Notice>
        )}
        <form action="/reports/download" className="flex flex-col gap-6">
          <Section title="Dates and store" hint="Up to one year at a time. Sales and GST count orders by the day they were delivered.">
            <Panel className="flex flex-wrap items-end gap-3 p-5">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reports-from">From</Label>
                <Input id="reports-from" name="from" type="date" defaultValue={from} max={today} required className="w-40" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reports-to">To</Label>
                <Input id="reports-to" name="to" type="date" defaultValue={to} max={today} required className="w-40" />
              </div>
              {stores.items.length > 1 && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="reports-store">Store</Label>
                  <Select name="storeId" defaultValue={stores.items.some((store) => store.id === storeId) ? storeId : "all"}>
                    <SelectTrigger id="reports-store" className="w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All stores</SelectItem>
                      {stores.items.map((store) => (
                        <SelectItem key={store.id} value={store.id}>
                          {store.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </Panel>
          </Section>
          <Section title="Download">
            <Panel className="divide-y">
              {REPORTS.map((report) => (
                <div key={report.id} className="flex flex-wrap items-center justify-between gap-3 p-5">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{report.title}</p>
                    <p className="text-sm text-muted-foreground">{report.description}</p>
                  </div>
                  <Button type="submit" name="report" value={report.id} variant="outline">
                    <Download />
                    CSV
                  </Button>
                </div>
              ))}
            </Panel>
          </Section>
        </form>
      </PageBody>
    </>
  );
}
