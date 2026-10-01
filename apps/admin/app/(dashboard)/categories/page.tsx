import type { Metadata } from "next";
import Link from "next/link";

import { CategoryDialog } from "@/components/catalog/category-dialog";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { requireAdmin } from "@/lib/dal";
import type { Category, Paginated } from "@/lib/types";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage() {
  await requireAdmin();
  const categories = await apiFetch<Paginated<Category>>("/categories", { query: { includeInactive: true, limit: 100 } });

  return (
    <>
      <PageHeader title="Categories" description="How products are grouped in the customer app" actions={<CategoryDialog />} />

      <div className="p-4 md:p-6">
        <Card>
          <CardContent>
            {categories.items.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">No categories yet. Create one to start adding products.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead className="text-right">Products</TableHead>
                    <TableHead className="text-right">Sort order</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">Edit</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.items.map((category) => (
                    <TableRow key={category.id}>
                      <TableCell className="font-medium">{category.name}</TableCell>
                      <TableCell className="text-muted-foreground">{category.slug}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Link href={`/products?categoryId=${category.id}`} className="underline-offset-4 hover:underline">
                          {category.productCount ?? 0}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{category.sortOrder}</TableCell>
                      <TableCell>
                        {category.isActive ? <Badge variant="secondary">Visible</Badge> : <Badge variant="outline">Hidden</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <CategoryDialog category={category} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        {categories.total > categories.items.length && (
          <p className="mt-3 text-sm text-muted-foreground">Showing the first {categories.items.length} of {categories.total} categories.</p>
        )}
      </div>
    </>
  );
}
