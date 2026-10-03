import type { Metadata } from "next";
import Link from "next/link";
import { ImageIcon } from "lucide-react";

import { BrandDialog } from "@/components/catalog/brand-dialog";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { requireAdmin } from "@/lib/dal";
import type { Brand, Paginated } from "@/lib/types";

export const metadata: Metadata = { title: "Brands" };

export default async function BrandsPage() {
  await requireAdmin();
  const brands = await apiFetch<Paginated<Brand>>("/brands", { query: { includeInactive: true, limit: 200 } });

  return (
    <>
      <PageHeader title="Brands" description="Brands shown on products and used in search" actions={<BrandDialog />} />

      <div className="p-4 md:p-6">
        <Card>
          <CardContent>
            {brands.items.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">No brands yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Brand</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead className="text-right">Products</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">Edit</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {brands.items.map((brand) => (
                    <TableRow key={brand.id}>
                      <TableCell>
                        <div className="flex items-center gap-3 font-medium">
                          <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-muted-foreground">
                            {brand.logoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element -- uploaded or admin-entered URLs from any host
                              <img src={brand.logoUrl} alt="" className="size-full object-contain" />
                            ) : (
                              <ImageIcon className="size-4" />
                            )}
                          </div>
                          {brand.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{brand.slug}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Link href={`/products?q=${encodeURIComponent(brand.name)}`} className="underline-offset-4 hover:underline">
                          {brand.productCount ?? 0}
                        </Link>
                      </TableCell>
                      <TableCell>{brand.isActive ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Switched off</Badge>}</TableCell>
                      <TableCell className="text-right">
                        <BrandDialog brand={brand} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        {brands.total > brands.items.length && (
          <p className="mt-3 text-sm text-muted-foreground">Showing the first {brands.items.length} of {brands.total} brands.</p>
        )}
      </div>
    </>
  );
}
