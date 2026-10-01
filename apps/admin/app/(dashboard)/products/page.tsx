import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Plus, Search } from "lucide-react";

import { CategoryFilter } from "@/components/category-filter";
import { PageHeader } from "@/components/page-header";
import { PaginationLinks } from "@/components/pagination-links";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { requireAdmin } from "@/lib/dal";
import { formatPackSize } from "@/lib/format";
import type { Category, Paginated, Product } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Products" };

const PAGE_SIZE = 50;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  await requireAdmin();
  const params = await searchParams;
  const q = first(params.q)?.trim().slice(0, 100) || undefined;
  const categoryId = first(params.categoryId) || undefined;
  const page = Math.max(1, Number.parseInt(first(params.page) ?? "1", 10) || 1);

  const [products, categories] = await Promise.all([
    apiFetch<Paginated<Product>>("/products", {
      query: { includeInactive: true, search: q, categoryId, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
    }),
    apiFetch<Paginated<Category>>("/categories", { query: { includeInactive: true, limit: 100 } }),
  ]);

  const href = (nextPage: number) => {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (categoryId) next.set("categoryId", categoryId);
    if (nextPage > 1) next.set("page", String(nextPage));
    const query = next.toString();
    return query ? `/products?${query}` : "/products";
  };
  const lastPage = Math.max(1, Math.ceil(products.total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Products"
        description="The shared catalog. Prices and stock are set per store."
        actions={
          <Button asChild>
            <Link href="/products/new">
              <Plus />
              New product
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Form action="/products" className="flex gap-2">
            {categoryId && <input type="hidden" name="categoryId" value={categoryId} />}
            <Input name="q" type="search" defaultValue={q} maxLength={100} placeholder="Search products" aria-label="Search products" className="w-64" />
            <Button type="submit" variant="outline" size="icon" aria-label="Search">
              <Search />
            </Button>
          </Form>
          <CategoryFilter categories={categories.items} />
        </div>

        <Card>
          <CardContent>
            {products.items.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {q || categoryId ? "No products match these filters." : "No products yet."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Stores</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.items.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="whitespace-normal">
                        <Link href={`/products/${product.id}`} className="font-medium underline-offset-4 hover:underline">
                          {product.name}
                        </Link>
                        <div className="text-xs text-muted-foreground">{formatPackSize(product.quantity, product.unit)}</div>
                      </TableCell>
                      <TableCell>{product.category.name}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", product.storeCount === 0 && "text-muted-foreground")}>
                        {product.storeCount === 0 ? "Not listed" : product.storeCount}
                      </TableCell>
                      <TableCell>
                        {product.isActive ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Inactive</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {products.total > PAGE_SIZE && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, products.total)} of {products.total}
            </span>
            <PaginationLinks page={page} lastPage={lastPage} href={href} />
          </div>
        )}
      </div>
    </>
  );
}
