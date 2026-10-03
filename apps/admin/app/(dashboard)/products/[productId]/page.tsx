import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ImagesManager } from "@/components/catalog/images-manager";
import { ListingDialog } from "@/components/catalog/listing-dialog";
import { ProductForm } from "@/components/catalog/product-form";
import { VariantsEditor } from "@/components/catalog/variants-editor";
import { AvailabilitySwitch } from "@/components/inventory/inventory-controls";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, apiFetch } from "@/lib/api";
import { getPublicSettings, requireAdmin } from "@/lib/dal";
import { formatMoney, productTitle } from "@/lib/format";
import type { Brand, Category, Listing, Paginated, ProductDetail, ProductListings, Store } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Product" };

async function getProduct(id: string) {
  try {
    return await apiFetch<ProductDetail>(`/products/${encodeURIComponent(id)}`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }
}

export default async function ProductPage({ params }: PageProps<"/products/[productId]">) {
  await requireAdmin();
  const { productId } = await params;
  const product = await getProduct(productId);

  const [listings, categories, brands, settings] = await Promise.all([
    apiFetch<ProductListings>(`/products/${encodeURIComponent(product.id)}/listings`),
    apiFetch<Paginated<Category>>("/categories", { query: { includeInactive: true, limit: 200 } }),
    apiFetch<Paginated<Brand>>("/brands", { query: { includeInactive: true, limit: 200 } }),
    getPublicSettings(),
  ]);
  const money = (amount: string) => formatMoney(amount, settings.currency);
  const listedCount = listings.items.filter((item) => item.listings.some((entry) => entry.listing)).length;
  const multiVariant = listings.variants.length > 1;
  const parent = categories.items.find((category) => category.id === product.category.parentId);

  function listingCells(store: Store, variant: ProductListings["variants"][number], listing: Listing | null) {
    const title = productTitle(product.name, variant.label);
    return (
      <>
        {listing ? (
          <>
            <TableCell className="text-right tabular-nums">{money(listing.sellingPrice)}</TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">{listing.mrp ? money(listing.mrp) : "—"}</TableCell>
            <TableCell className="text-right tabular-nums">
              <Link href={`/inventory?storeId=${store.id}&q=${encodeURIComponent(variant.sku)}`} className="underline-offset-4 hover:underline">
                {listing.stockQuantity}
              </Link>
            </TableCell>
            <TableCell>
              <AvailabilitySwitch storeId={store.id} variantId={variant.id} title={title} isAvailable={listing.isAvailable} />
            </TableCell>
          </>
        ) : (
          <TableCell colSpan={4} className="text-muted-foreground">
            Not listed
          </TableCell>
        )}
        <TableCell className="text-right">
          <ListingDialog variantId={variant.id} title={title} store={store} listing={listing} />
        </TableCell>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={product.name}
        description={[
          parent ? `${parent.name} › ${product.category.name}` : product.category.name,
          product.brand?.name,
          `${product.variants.length} ${product.variants.length === 1 ? "variant" : "variants"}`,
          `listed at ${listedCount} of ${listings.items.length} stores`,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={!product.isActive && <Badge variant="outline">Inactive</Badge>}
      />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
          <Link href="/products">
            <ArrowLeft />
            Products
          </Link>
        </Button>

        <div className="grid items-start gap-4 xl:grid-cols-5">
          <div className="flex min-w-0 flex-col gap-4 xl:col-span-3">
            <Card>
              <CardHeader>
                <CardTitle>Variants</CardTitle>
                <CardDescription>
                  Sizes, flavours or other options customers choose from. Each variant has its own SKU, price and stock.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <VariantsEditor key={JSON.stringify([product.options, product.variants])} product={product} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Store pricing</CardTitle>
                <CardDescription>
                  Each store sets its own price and availability per variant. Stock is managed on the Inventory page.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {listings.items.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Create a store before listing products.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{multiVariant ? "Store / variant" : "Store"}</TableHead>
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
                      {listings.items.flatMap(({ store, listings: storeListings }) => {
                        const storeCell = (
                          <>
                            <div className="font-medium">{store.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {store.code}
                              {store.status === "INACTIVE" && " · inactive store"}
                            </div>
                          </>
                        );
                        const rows = listings.variants.map((variant) => {
                          const listing = storeListings.find((entry) => entry.variantId === variant.id)?.listing ?? null;
                          return (
                            <TableRow key={`${store.id}:${variant.id}`} className={cn(!variant.isActive && "text-muted-foreground")}>
                              <TableCell className={cn("whitespace-normal", multiVariant && "pl-6")}>
                                {multiVariant ? (
                                  <>
                                    {variant.label || variant.sku}
                                    {!variant.isActive && <span className="ml-2 text-xs">(inactive)</span>}
                                  </>
                                ) : (
                                  storeCell
                                )}
                              </TableCell>
                              {listingCells(store, variant, listing)}
                            </TableRow>
                          );
                        });
                        return multiVariant
                          ? [
                              <TableRow key={store.id} className="bg-muted/40 hover:bg-muted/40">
                                <TableCell colSpan={6}>{storeCell}</TableCell>
                              </TableRow>,
                              ...rows,
                            ]
                          : rows;
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex min-w-0 flex-col gap-4 xl:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Photos</CardTitle>
                <CardDescription>The first photo is the main one.</CardDescription>
              </CardHeader>
              <CardContent>
                <ImagesManager product={product} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
                <CardDescription>Shared by every variant and store. Past orders keep the details they were placed with.</CardDescription>
              </CardHeader>
              <CardContent>
                <ProductForm product={product} categories={categories.items} brands={brands.items} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
