import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { requireAdmin } from "@/lib/dal";
import type { Paginated, StoreDetails } from "@/lib/types";

export const metadata: Metadata = { title: "Stores" };

function CountLink({ href, count }: { href: string; count: number }) {
  return (
    <Link href={href} className="underline-offset-4 hover:underline">
      {count}
    </Link>
  );
}

export default async function StoresPage() {
  await requireAdmin();
  const stores = await apiFetch<Paginated<StoreDetails>>("/stores", { query: { includeInactive: true, limit: 100 } });

  return (
    <>
      <PageHeader
        title="Stores"
        description="Where orders are packed and which areas each store delivers to"
        actions={
          <Button asChild>
            <Link href="/stores/new">
              <Plus />
              New store
            </Link>
          </Button>
        }
      />

      <div className="p-4 md:p-6">
        <Card>
          <CardContent>
            {stores.items.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">No stores yet. Create one to start taking orders.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Store</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Radius</TableHead>
                    <TableHead className="text-right">Staff</TableHead>
                    <TableHead className="text-right">Products</TableHead>
                    <TableHead className="text-right">Open orders</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stores.items.map((store) => (
                    <TableRow key={store.id}>
                      <TableCell>
                        <Link href={`/stores/${store.id}`} className="font-medium underline-offset-4 hover:underline">
                          {store.name}
                        </Link>
                        <div className="text-xs text-muted-foreground">{store.code}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {store.city}, {store.postalCode}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{Number(store.serviceRadiusKm)} km</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <CountLink href={`/stores/${store.id}#staff`} count={store.staffCount} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <CountLink href={`/inventory?storeId=${store.id}`} count={store.productCount} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <CountLink href={`/orders?storeId=${store.id}`} count={store.activeOrderCount} />
                      </TableCell>
                      <TableCell>
                        {store.status === "ACTIVE" ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Inactive</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
