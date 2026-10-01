import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ListingDialog } from "@/components/catalog/listing-dialog";
import { ProductForm } from "@/components/catalog/product-form";
import { AvailabilitySwitch } from "@/components/inventory/inventory-controls";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, apiFetch } from "@/lib/api";
import { getPublicSettings, requireAdmin } from "@/lib/dal";
import { formatMoney } from "@/lib/format";
import type { Category, Paginated, Product, ProductListing } from "@/lib/types";

export const metadata: Metadata = { title: "Product" };

async function getProduct(id: string) {
  try {
    return await apiFetch<Product>(`/products/${encodeURIComponent(id)}`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }
}

export default async function ProductPage({ params }: PageProps<"/products/[productId]">) {
  await requireAdmin();
  const { productId } = await params;
  const product = await getProduct(productId);

  const [listings, categories, settings] = await Promise.all([
    apiFetch<{ items: ProductListing[] }>(`/products/${encodeURIComponent(product.id)}/listings`),
    apiFetch<Paginated<Category>>("/categories", { query: { includeInactive: true, limit: 100 } }),
    getPublicSettings(),
  ]);
  const money = (amount: string) => formatMoney(amount, settings.currency);
  const listedCount = listings.items.filter((item) => item.listing).length;

  return (
    <>
      <PageHeader
        title={product.name}
        description={`${product.category.name} · listed at ${listedCount} of ${listings.items.length} stores`}
        actions={!product.isActive && <Badge variant="outline">Inactive</Badge>}
      />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
          <Link href="/products">
            <ArrowLeft />
            Products
          </Link>
        </Button>

        <div className="grid gap-4 xl:grid-cols-5">
          <Card className="xl:col-span-3">
            <CardHeader>
              <CardTitle>Store pricing</CardTitle>
              <CardDescription>
                Each store sets its own price and availability. Stock is managed on the Inventory page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {listings.items.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Create a store before listing products.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Store</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">MRP</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead>Available</TableHead>
                      <TableHead className="text-right">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {listings.items.map(({ store, listing }) => (
                      <TableRow key={store.id}>
                        <TableCell>
                          <div className="font-medium">{store.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {store.code}
                            {store.status === "INACTIVE" && " · inactive store"}
                          </div>
                        </TableCell>
                        {listing ? (
                          <>
                            <TableCell className="text-right tabular-nums">{money(listing.sellingPrice)}</TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">{listing.mrp ? money(listing.mrp) : "—"}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              <Link href={`/inventory?storeId=${store.id}&q=${encodeURIComponent(product.name)}`} className="underline-offset-4 hover:underline">
                                {listing.stockQuantity}
                              </Link>
                            </TableCell>
                            <TableCell>
                              <AvailabilitySwitch storeId={store.id} productId={product.id} productName={product.name} isAvailable={listing.isAvailable} />
                            </TableCell>
                          </>
                        ) : (
                          <TableCell colSpan={4} className="text-muted-foreground">
                            Not listed
                          </TableCell>
                        )}
                        <TableCell className="text-right">
                          <ListingDialog productId={product.id} productName={product.name} store={store} listing={listing} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Details</CardTitle>
              <CardDescription>Shared by every store. Past orders keep the name they were placed with.</CardDescription>
            </CardHeader>
            <CardContent>
              <ProductForm product={product} categories={categories.items} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
