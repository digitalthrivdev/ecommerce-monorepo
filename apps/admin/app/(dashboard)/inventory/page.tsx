import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Search } from "lucide-react";

import { AvailabilitySwitch, StockAdjustDialog } from "@/components/inventory/inventory-controls";
import { PageHeader } from "@/components/page-header";
import { StoreFilter } from "@/components/store-filter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { getCurrentUser, getPublicSettings } from "@/lib/dal";
import { formatDateTime } from "@/lib/format";
import type { InventoryItem, InventoryList, Paginated, Store } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Inventory" };

const PAGE_SIZE = 50;

const TABS = [
  { id: "all", label: "All products", query: {} },
  { id: "low", label: "Low stock", query: { stock: "low" } },
  { id: "out", label: "Out of stock", query: { stock: "out" } },
  { id: "unavailable", label: "Hidden", query: { isAvailable: false } },
] as const;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function packSize(item: InventoryItem) {
  if (!item.packQuantity && !item.unit) return null;
  return [item.packQuantity && Number(item.packQuantity).toString(), item.unit].filter(Boolean).join(" ");
}

function StockCell({ quantity, threshold }: { quantity: number; threshold: number }) {
  if (quantity === 0) return <Badge variant="destructive">Out of stock</Badge>;
  return (
    <span className={cn("tabular-nums", quantity <= threshold && "font-medium text-amber-600 dark:text-amber-500")}>
      {quantity}
      {quantity <= threshold && <span className="ml-1 text-xs font-normal">low</span>}
    </span>
  );
}

export default async function InventoryPage({ searchParams }: PageProps<"/inventory">) {
  const user = await getCurrentUser();
  const isAdmin = user.role === "ADMIN";
  const params = await searchParams;

  const stores = isAdmin ? await apiFetch<Paginated<Store>>("/stores", { query: { includeInactive: true, limit: 100 } }) : null;
  const requestedStore = first(params.storeId);
  const store = isAdmin
    ? (stores!.items.find((candidate) => candidate.id === requestedStore) ??
      stores!.items.find((candidate) => candidate.status === "ACTIVE") ??
      stores!.items[0])
    : user.store!;

  const tab = TABS.find((candidate) => candidate.id === first(params.tab)) ?? TABS[0];
  const q = first(params.q)?.trim().slice(0, 100) || undefined;
  const page = Math.max(1, Number.parseInt(first(params.page) ?? "1", 10) || 1);

  if (!store) {
    return (
      <>
        <PageHeader title="Inventory" />
        <p className="p-6 text-sm text-muted-foreground">Create a store before managing inventory.</p>
      </>
    );
  }

  const [inventory, settings] = await Promise.all([
    apiFetch<InventoryList>(`/stores/${encodeURIComponent(store.id)}/inventory`, {
      query: { ...tab.query, search: q, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
    }),
    getPublicSettings(),
  ]);

  const href = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { storeId: isAdmin ? store.id : undefined, tab: tab.id, q, ...changes };
    for (const [key, value] of Object.entries(merged)) {
      if (value && !(key === "tab" && value === "all")) next.set(key, value);
    }
    const query = next.toString();
    return query ? `/inventory?${query}` : "/inventory";
  };
  const lastPage = Math.max(1, Math.ceil(inventory.total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Inventory"
        description={`Stock and availability at ${store.name}`}
        actions={stores && stores.items.length > 1 && <StoreFilter stores={stores.items} allowAll={false} value={store.id} />}
      />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <nav aria-label="Stock filter" className="flex flex-wrap gap-1">
            {TABS.map((candidate) => (
              <Button key={candidate.id} asChild size="sm" variant={candidate.id === tab.id ? "secondary" : "ghost"}>
                <Link href={href({ tab: candidate.id, page: undefined })} aria-current={candidate.id === tab.id ? "page" : undefined}>
                  {candidate.label}
                </Link>
              </Button>
            ))}
          </nav>

          <Form action="/inventory" className="flex gap-2">
            {isAdmin && <input type="hidden" name="storeId" value={store.id} />}
            {tab.id !== "all" && <input type="hidden" name="tab" value={tab.id} />}
            <Input name="q" type="search" defaultValue={q} maxLength={100} placeholder="Search products" aria-label="Search products" className="w-64" />
            <Button type="submit" variant="outline" size="icon" aria-label="Search">
              <Search />
            </Button>
          </Form>
        </div>

        <Card>
          <CardContent>
            {inventory.items.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {q ? `No products match “${q}”.` : tab.id === "all" ? "No products are listed at this store yet." : "Nothing here right now."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead>Available</TableHead>
                    <TableHead>Last updated</TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">Adjust</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventory.items.map((item) => (
                    <TableRow key={item.storeProductId} className={cn(!item.isAvailable && "text-muted-foreground")}>
                      <TableCell className="whitespace-normal">
                        <div className="font-medium">{item.name}</div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {packSize(item)}
                          {!item.productIsActive && <Badge variant="outline">Removed from catalog</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>{item.category.name}</TableCell>
                      <TableCell className="text-right">
                        <StockCell quantity={item.stockQuantity} threshold={inventory.lowStockThreshold} />
                      </TableCell>
                      <TableCell>
                        <AvailabilitySwitch storeId={store.id} productId={item.productId} productName={item.name} isAvailable={item.isAvailable} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {item.stockUpdatedAt ? formatDateTime(item.stockUpdatedAt, settings.timezone) : "Never"}
                      </TableCell>
                      <TableCell className="text-right">
                        <StockAdjustDialog storeId={store.id} productId={item.productId} productName={item.name} currentStock={item.stockQuantity} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {tab.id === "low" && `Available products with ${inventory.lowStockThreshold} or fewer in stock. `}
            {tab.id === "unavailable" && "Hidden products are not shown to customers. "}
            {inventory.total > 0 && `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, inventory.total)} of ${inventory.total}`}
          </span>
          {inventory.total > PAGE_SIZE && (
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm" className={cn(page <= 1 && "pointer-events-none opacity-50")}>
                <Link href={href({ page: String(page - 1) })} aria-disabled={page <= 1}>
                  Previous
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className={cn(page >= lastPage && "pointer-events-none opacity-50")}>
                <Link href={href({ page: String(page + 1) })} aria-disabled={page >= lastPage}>
                  Next
                </Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
