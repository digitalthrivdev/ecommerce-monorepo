import type { Metadata } from "next";
import Link from "next/link";

import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { DeletePickupLocationButton, MakeDefaultButton, PickupLocationDialog } from "@/components/pickup-locations/pickup-location-controls";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { requireAdmin } from "@/lib/dal";
import type { PickupLocation } from "@/lib/types";

export const metadata: Metadata = { title: "Pickup locations" };

export default async function PickupLocationsPage() {
  await requireAdmin();
  const { items } = await apiFetch<{ items: PickupLocation[] }>("/pickup-locations");
  const defaultLocation = items.find((location) => location.isDefault);

  return (
    <>
      <PageHeader
        title="Pickup locations"
        description="Where couriers collect parcels"
        actions={<PickupLocationDialog first={items.length === 0} />}
      />

      <div className="flex max-w-5xl flex-col gap-4 p-4 md:p-6">
        {!defaultLocation && (
          <Notice tone="warning" title="Add your pickup address">
            Invoices show the default pickup location as the seller&apos;s address and use its state for GST.
          </Notice>
        )}
        {defaultLocation && !defaultLocation.invoiceGstin && (
          <Notice tone="warning" title="Invoices have no GSTIN">
            Add the GSTIN registered in {defaultLocation.state} in{" "}
            <Link href="/settings?tab=invoices" className="font-medium underline underline-offset-4">
              Settings → GST invoices
            </Link>
            , or make a location in your GSTIN&apos;s state the default.
          </Notice>
        )}

        {items.length > 0 && (
          <Card>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((location) => (
                    <TableRow key={location.id}>
                      <TableCell>
                        <div className="flex items-center gap-2 font-medium">
                          {location.name}
                          {location.isDefault && <Badge>Default</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-sm text-sm whitespace-normal">
                        {[location.addressLine1, location.addressLine2, location.landmark && `Near ${location.landmark}`].filter(Boolean).join(", ")}
                        <div className="text-muted-foreground">
                          {location.city}, {location.state} {location.postalCode}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {location.contactName}
                        <div className="text-xs text-muted-foreground">{[location.phone, location.email].filter(Boolean).join(" · ")}</div>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {!location.isDefault && <MakeDefaultButton location={location} />}
                        <PickupLocationDialog location={location} />
                        {(!location.isDefault || items.length === 1) && <DeletePickupLocationButton location={location} />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
        <p className="text-sm text-muted-foreground">
          Invoices of orders delivered from now on show the default location as the seller&apos;s address. You can have up to 20 locations.
        </p>
      </div>
    </>
  );
}
