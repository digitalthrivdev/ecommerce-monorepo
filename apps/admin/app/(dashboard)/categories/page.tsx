import type { Metadata } from "next";
import Link from "next/link";
import { CornerDownRight, ImageIcon } from "lucide-react";

import { CategoryDialog } from "@/components/catalog/category-dialog";
import { DeleteCategoryButton } from "@/components/catalog/delete-category-button";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { categoryTree } from "@/lib/categories";
import { requireAdmin } from "@/lib/dal";
import type { Category, Paginated } from "@/lib/types";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage() {
  await requireAdmin();
  const categories = await apiFetch<Paginated<Category>>("/categories", { query: { includeInactive: true, limit: 200 } });
  const tree = categoryTree(categories.items);
  const parents = categories.items.filter((category) => !category.parentId);

  const row = (category: Category, depth: number) => (
    <TableRow key={category.id}>
      <TableCell className="font-medium">
        <span className={depth ? "flex items-center gap-2 pl-4 font-normal" : "flex items-center gap-3"}>
          {depth > 0 && <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground" />}
          <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-muted-foreground">
            {category.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- uploaded or admin-entered URLs from any host
              <img src={category.imageUrl} alt="" className="size-full object-cover" />
            ) : (
              <ImageIcon className="size-4" />
            )}
          </span>
          {category.name}
        </span>
      </TableCell>
      <TableCell className="text-muted-foreground">{category.slug}</TableCell>
      <TableCell className="text-right tabular-nums">
        <Link href={`/products?categoryId=${category.id}`} className="underline-offset-4 hover:underline">
          {category.productCount ?? 0}
        </Link>
      </TableCell>
      <TableCell className="text-right tabular-nums">{category.sortOrder}</TableCell>
      <TableCell>{category.isActive ? <Badge variant="secondary">Visible</Badge> : <Badge variant="outline">Hidden</Badge>}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          {depth === 0 && <CategoryDialog parents={parents} defaultParentId={category.id} />}
          <CategoryDialog category={category} parents={parents} />
          <DeleteCategoryButton category={category} />
        </div>
      </TableCell>
    </TableRow>
  );

  return (
    <>
      <PageHeader
        title="Categories"
        description="How products are grouped in the customer app. Categories can have one level of sub-categories."
        actions={<CategoryDialog parents={parents} />}
      />

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
                <TableBody>{tree.flatMap((root) => [row(root, 0), ...root.children.map((child) => row(child, 1))])}</TableBody>
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
