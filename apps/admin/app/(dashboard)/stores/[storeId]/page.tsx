import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Boxes, ExternalLink, ShoppingBag } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { AddStaffDialog, RemoveStaffButton } from "@/components/stores/staff-controls";
import { StoreForm } from "@/components/stores/store-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, apiFetch } from "@/lib/api";
import { requireAdmin } from "@/lib/dal";
import type { StaffMember, StoreDetails } from "@/lib/types";

export const metadata: Metadata = { title: "Store" };

async function getStore(id: string) {
  try {
    return await apiFetch<StoreDetails>(`/stores/${encodeURIComponent(id)}`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }
}

export default async function StorePage({ params }: PageProps<"/stores/[storeId]">) {
  await requireAdmin();
  const { storeId } = await params;
  const store = await getStore(storeId);

  const staff = await apiFetch<{ items: StaffMember[] }>(`/stores/${encodeURIComponent(store.id)}/staff`);
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${Number(store.latitude)},${Number(store.longitude)}`;

  return (
    <>
      <PageHeader
        title={store.name}
        description={`${store.code} · ${store.city}`}
        actions={store.status === "ACTIVE" ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Inactive</Badge>}
      />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href="/stores">
              <ArrowLeft />
              Stores
            </Link>
          </Button>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/orders?storeId=${store.id}`}>
                <ShoppingBag />
                {store.activeOrderCount} open {store.activeOrderCount === 1 ? "order" : "orders"}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/inventory?storeId=${store.id}`}>
                <Boxes />
                {store.productCount} {store.productCount === 1 ? "product" : "products"}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={mapUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
                View on map
              </a>
            </Button>
          </div>
        </div>

        <div className="grid items-start gap-4 xl:grid-cols-5">
          <Card className="xl:col-span-3">
            <CardHeader>
              <CardTitle>Details</CardTitle>
              <CardDescription>Past orders keep the details they were placed with.</CardDescription>
            </CardHeader>
            <CardContent>
              <StoreForm store={store} />
            </CardContent>
          </Card>

          <Card id="staff" className="scroll-mt-20 xl:col-span-2">
            <CardHeader>
              <CardTitle>Staff</CardTitle>
              <CardDescription>Staff see only this store&apos;s orders and inventory.</CardDescription>
              <CardAction>
                <AddStaffDialog storeId={store.id} storeName={store.name} />
              </CardAction>
            </CardHeader>
            <CardContent>
              {staff.items.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No staff yet. Add someone to accept and pack orders.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-right">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staff.items.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell>
                          <div className="font-medium">{member.name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{member.phone}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <RemoveStaffButton storeId={store.id} member={member} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
